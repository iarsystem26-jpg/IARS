-- An open session on a suspended day must not strand future service participation.
CREATE OR REPLACE FUNCTION app_private.correction_credit_plan(c rmc_attendance_corrections, verified_in timestamp with time zone, verified_out timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev public.rmc_events; p public.rmc_profiles; s record; ctx jsonb; att jsonb; old_d numeric; old_m numeric;
 old_rendered numeric; rendered numeric:=0; desired numeric; new_d numeric; new_m numeric; extra numeric; balance numeric; complete boolean; award numeric; assessed numeric; ceiling numeric;
begin
 select * into strict ev from public.rmc_events where id=c.event_id;
 select * into strict p from public.rmc_profiles where id=c.student_id;
 if c.kind not in ('service','merit') or ev.data->>'kind' is distinct from c.kind or ev.organization_id is not null then raise exception 'Unsupported credit correction.'; end if;
 if app_private.frozen(p.node_id) or app_private.frozen(ev.node_id) or p.status<>'active' or exists(select 1 from public.rmc_account_freezes where account_id=p.id) then raise exception 'Student or activity operations are frozen or inactive.'; end if;
 if nullif(ev.data->>'cancellationStatus','') is not null or ev.data->>'approvalStatus' in ('pending','rejected') or ev.data->>'status' in ('pending','rejected') then raise exception 'This activity is cancelled or unapproved.'; end if;
 if ev.end_at>=now() then raise exception 'Wait until the activity has ended.'; end if;
 if exists(select 1 from public.rmc_excuses where event_id=ev.id and student_id=p.id and data->>'status' in ('pending','approved')) then raise exception 'Resolve the pending or approved excuse with OSSA first.'; end if;
 ctx:=app_private.correction_credit_context(ev,p.id,c.slot);
 if ctx is distinct from c.credit_context then raise exception 'Attendance or credits changed after submission. Reject and resubmit against the latest records.'; end if;
 select * into s from app_private.correction_sessions(ev,p.profile) where slot=c.slot;
 if s.slot is null or s.ends_at<=s.starts_at then raise exception 'The session configuration changed.'; end if;
 if s.starts_at is distinct from c.session_starts_at or s.ends_at is distinct from c.session_ends_at or s.late_at is distinct from c.session_late_at then raise exception 'The session configuration changed. Reject and resubmit.'; end if;
 if verified_in is not null and (not isfinite(verified_in) or verified_in<s.starts_at or verified_in>s.ends_at) then raise exception 'Verified time-in must be within the session.'; end if;
 if verified_out is not null and (verified_in is null or not isfinite(verified_out) or verified_out<verified_in or verified_out>s.ends_at) then raise exception 'Verified time-out must follow time-in within the session.'; end if;
 -- Completed and open participation in any other service/merit session cannot overlap.
 if verified_in is not null and exists(select 1 from public.rmc_attendance a join public.rmc_events e on e.id=a.event_id
 where a.student_id=p.id and e.data->>'kind' in ('service','merit') and not(a.event_id=ev.id and a.slot=c.slot)
 and a.data->>'time_in' is not null and (a.data->>'time_out' is not null or not app_private.session_suspended(e,p.profile,(to_timestamp((a.data->>'time_in')::numeric/1000) at time zone 'Asia/Manila')::date)) and to_timestamp((a.data->>'time_in')::numeric/1000)<coalesce(verified_out,s.ends_at)
 and coalesce(to_timestamp((a.data->>'time_out')::numeric/1000),e.end_at)>verified_in) then raise exception 'Verified participation overlaps another service or merit session. Resolve that record first.'; end if;
 if verified_out is not null then rendered:=round(extract(epoch from verified_out-verified_in)/3600,6); end if;
 old_rendered:=coalesce((c.original->>'rendered_hours')::numeric,0);
 select greatest(0,-coalesce(sum((value->>'change')::numeric),0)) into old_d from jsonb_array_elements(ctx->'sanctions');
 select greatest(0,coalesce(sum((value->>'hours')::numeric),0)) into old_m from jsonb_array_elements(ctx->'merit');
 balance:=app_private.balance(p.id);
 assessed:=coalesce((c.original->>'credit_assessed_hours')::numeric,(c.original->>'awarded_hours')::numeric,old_rendered);
 ceiling:=coalesce((c.original->>'credit_ceiling_hours')::numeric,old_d+old_m);
 att:=ctx->'attendance';
 att:=jsonb_set(att,array[c.slot],jsonb_strip_nulls(jsonb_build_object('time_in',case when verified_in is not null then extract(epoch from verified_in)*1000 end,'time_out',case when verified_out is not null then extract(epoch from verified_out)*1000 end)));
 select not exists(select 1 from app_private.correction_sessions(ev,p.profile) x where x.ends_at>x.starts_at
 and (att->x.slot->>'time_in' is null or att->x.slot->>'time_out' is null)) into complete;
 award:=coalesce((ev.data->>'meritHours')::numeric,0);
 if c.kind='merit' and (award<0.01 or award>24) then raise exception 'Invalid fixed merit award. Contact administration.'; end if;
 desired:=case when c.kind='service' then least(rendered,ceiling+greatest(0,rendered-assessed)) when complete then award else 0 end;
 -- Reductions revoke saved merit first, then restore the sanctions previously cleared.
 new_d:=least(old_d,desired); new_m:=least(old_m,greatest(0,desired-new_d));
 extra:=greatest(0,desired-old_d-old_m);
 new_d:=new_d+least(balance,extra);
 if c.kind='merit' or ev.data#>>'{service,overflow}'='merit' then new_m:=new_m+greatest(0,extra-balance); end if;
 return jsonb_build_object('rendered_before',old_rendered,'rendered_after',rendered,'cleared_before',old_d,'cleared_after',new_d,
 'merit_before',old_m,'merit_after',new_m,'sanction_change',old_d-new_d,'merit_change',new_m-old_m,
 'balance_before',balance,'balance_after',balance+old_d-new_d,'complete',complete,'kind',c.kind,'assessed_after',greatest(assessed,rendered),'ceiling_after',greatest(ceiling,new_d+new_m));
end $function$
;
CREATE OR REPLACE FUNCTION app_private.record_attendance(event_id uuid, student_id uuid, direction text, qr_token text, scan_position jsonb, manual_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
begin
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 if e.organization_id is not null and app_private.organization_manager(e.organization_id) then
  if a.id is null or app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is unavailable for this account or unit.'; end if;
 else
  perform app_private.assert_permission('attendance.scan',p.node_id);
 end if;
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is not null then
  if (app_private.resolve_qr(qr_token)->>'uid')::uuid<>p.id then raise exception 'QR does not match this student.'; end if;
 elsif coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 volunteer:=not app_private.recipient(e.data,p.profile) and app_private.ceremony_volunteer(e.data,p.profile);
 if not app_private.recipient(e.data,p.profile) and not volunteer then raise exception 'Student is not a recipient or eligible volunteer of this event.'; end if;
 if e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false) then raise exception 'Student is outside the ceremony scope.'; end if;
 if app_private.session_suspended(e,p.profile,local_now::date) then raise exception 'Attendance is suspended for this student and session.'; end if;
 windows:=app_private.ceremony_windows(e.data,p.profile);
 if e.data->>'cancellationStatus' is not null or e.data->>'status'='done' or now()<e.start_at or now()>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(windows)>0 then
  select value into w from jsonb_array_elements(windows) where local_now::time>=(value->>'timeIn')::time
   and (local_now::time<(value->>'timeOut')::time or (direction='out' and local_now::time=(value->>'timeOut')::time))
   order by case when direction='out' and exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=local_now::date::text||':'||(value->>'id') and att.data->>'time_out' is null) then 0 else 1 end, value->>'timeIn' limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record is not null then return record||'{"already_recorded":true}'; end if;
  if e.data->>'kind' in ('service','merit') and exists(select 1 from public.rmc_attendance att join public.rmc_events other on other.id=att.event_id
   where att.student_id=p.id and att.event_id<>e.id and att.data->>'time_in' is not null and att.data->>'time_out' is null
    and not app_private.session_suspended(other,p.profile,(to_timestamp((att.data->>'time_in')::numeric/1000) at time zone 'Asia/Manila')::date)
    and other.data->>'kind' in ('service','merit') and other.end_at>=now() and other.data->>'cancellationStatus' is null) then
   raise exception 'Scan out of the other service or merit activity before starting this one.';
  end if;
  status:=case when now()>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'manual' else 'qr' end,'manual_reason',manual_reason,'volunteer',volunteer);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if not volunteer and status='late' and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null then raise exception 'Scan in before scanning out.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  window_start:=case when w is null then extract(epoch from e.start_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila'))*1000 end;
  window_end:=case when w is null then extract(epoch from e.end_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeOut')::time) at time zone 'Asia/Manila'))*1000 end;
  rendered:=round(greatest(0,least(stamp,window_end,extract(epoch from e.end_at)*1000)-greatest((record->>'time_in')::numeric,window_start,extract(epoch from e.start_at)*1000))/3600000,6);
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',rendered);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
  if e.data->>'kind'='merit' then
   completed:=not exists(
    select 1 from generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day') day
    cross join lateral jsonb_array_elements(case when jsonb_array_length(windows)>0 then windows else '[{"id":"default"}]'::jsonb end) win
    where not app_private.session_suspended(e,p.profile,day::date) and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
     and att.slot=case when win->>'id'='default' then 'default' else day::date::text||':'||(win->>'id') end
     and att.data->>'time_in' is not null and att.data->>'time_out' is not null)
   );
  end if;
  earned:=case when volunteer then case when e.data#>>'{ceremony,allowVolunteerMerit}'='true' then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else 0 end
   when e.data->>'kind'='service' then rendered when e.data->>'kind'='merit' and completed then (e.data->>'meritHours')::numeric else 0 end;
  source_key:=case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end;
  if exists(select 1 from public.rmc_sanctions where source=source_key) or exists(select 1 from public.rmc_merit_credits where source=source_key) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  excess:=case when (e.data->>'kind'='service' and e.data#>>'{service,overflow}'='merit') or e.data->>'kind'='merit' then round(greatest(0,earned-deducted),6) else 0 end;
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Completed activity: '||(e.data->>'title'),e.id,source_key); end if;
  if excess>0 then insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(p.id,e.id,source_key,excess,a.id); end if;
  record:=record||jsonb_build_object('deducted_hours',deducted,'merit_earned_hours',excess,'awarded_hours',earned,'completion_pending',e.data->>'kind'='merit' and not completed);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $function$
;
CREATE OR REPLACE FUNCTION app_private.record_offline_attendance_at(event_id uuid, student_id uuid, direction text, qr_token text, scan_position jsonb, manual_reason text, captured_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=captured_at at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from captured_at)*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
begin
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 if e.organization_id is not null and app_private.organization_manager(e.organization_id) then
  if a.id is null or app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is unavailable for this account or unit.'; end if;
 else
  perform app_private.assert_permission('attendance.scan',p.node_id);
 end if;
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is null and coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 volunteer:=not app_private.recipient(e.data,p.profile) and app_private.ceremony_volunteer(e.data,p.profile);
 if not app_private.recipient(e.data,p.profile) and not volunteer then raise exception 'Student is not a recipient or eligible volunteer of this event.'; end if;
 if e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false) then raise exception 'Student is outside the ceremony scope.'; end if;
 if app_private.session_suspended(e,p.profile,local_now::date) then raise exception 'Attendance is suspended for this student and session.'; end if;
 windows:=app_private.ceremony_windows(e.data,p.profile);
 if e.data->>'cancellationStatus' is not null or captured_at<e.start_at or captured_at>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(windows)>0 then
  select value into w from jsonb_array_elements(windows) where local_now::time>=(value->>'timeIn')::time
   and (local_now::time<(value->>'timeOut')::time or (direction='out' and local_now::time=(value->>'timeOut')::time))
   order by case when direction='out' and exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=local_now::date::text||':'||(value->>'id') and att.data->>'time_out' is null) then 0 else 1 end, value->>'timeIn' limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record->>'status'='absent' then
   if record->>'scanned_by_name' is distinct from 'System' or record->>'time_in' is not null then raise exception 'This absence was manually reviewed. Review the queued scan.' using errcode='22023'; end if;
   delete from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=slot_id;
   delete from public.rmc_sanctions where source='absent:'||e.id::text||':'||p.id::text||':'||slot_id;
   record:=null;
  end if;
  if record is not null and coalesce(record->>'status','') not in ('present','late') then raise exception 'Attendance was reviewed or excused. Review the queued scan.' using errcode='22023'; end if;
  if record is not null then return record||'{"already_recorded":true}'; end if;
  if e.data->>'kind' in ('service','merit') and exists(select 1 from public.rmc_attendance att join public.rmc_events other on other.id=att.event_id
   where att.student_id=p.id and att.event_id<>e.id and att.data->>'time_in' is not null and att.data->>'time_out' is null
    and not app_private.session_suspended(other,p.profile,(to_timestamp((att.data->>'time_in')::numeric/1000) at time zone 'Asia/Manila')::date)
    and other.data->>'kind' in ('service','merit') and other.end_at>=captured_at and other.data->>'cancellationStatus' is null) then
   raise exception 'Scan out of the other service or merit activity before starting this one.';
  end if;
  status:=case when captured_at>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'offline_manual' else 'offline_qr' end,'manual_reason',manual_reason,'volunteer',volunteer);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if not volunteer and status='late' and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null or record->>'time_in' is null then raise exception 'Scan in before scanning out.'; end if;
  if stamp<(record->>'time_in')::numeric then raise exception 'Scan-out predates the saved scan-in. Review the device clock or conflicting record.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  window_start:=case when w is null then extract(epoch from e.start_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila'))*1000 end;
  window_end:=case when w is null then extract(epoch from e.end_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeOut')::time) at time zone 'Asia/Manila'))*1000 end;
  rendered:=round(greatest(0,least(stamp,window_end,extract(epoch from e.end_at)*1000)-greatest((record->>'time_in')::numeric,window_start,extract(epoch from e.start_at)*1000))/3600000,6);
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',rendered);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
  if e.data->>'kind'='merit' then
   completed:=not exists(
    select 1 from generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day') day
    cross join lateral jsonb_array_elements(case when jsonb_array_length(windows)>0 then windows else '[{"id":"default"}]'::jsonb end) win
    where not app_private.session_suspended(e,p.profile,day::date) and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
     and att.slot=case when win->>'id'='default' then 'default' else day::date::text||':'||(win->>'id') end
     and att.data->>'time_in' is not null and att.data->>'time_out' is not null)
   );
  end if;
  earned:=case when volunteer then case when e.data#>>'{ceremony,allowVolunteerMerit}'='true' then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else 0 end
   when e.data->>'kind'='service' then rendered when e.data->>'kind'='merit' and completed then (e.data->>'meritHours')::numeric else 0 end;
  source_key:=case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end;
  if exists(select 1 from public.rmc_sanctions where source=source_key) or exists(select 1 from public.rmc_merit_credits where source=source_key) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  excess:=case when (e.data->>'kind'='service' and e.data#>>'{service,overflow}'='merit') or e.data->>'kind'='merit' then round(greatest(0,earned-deducted),6) else 0 end;
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Completed activity: '||(e.data->>'title'),e.id,source_key); end if;
  if excess>0 then insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(p.id,e.id,source_key,excess,a.id); end if;
  record:=record||jsonb_build_object('deducted_hours',deducted,'merit_earned_hours',excess,'awarded_hours',earned,'completion_pending',e.data->>'kind'='merit' and not completed);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id,'captured_at',stamp,'synced_at',extract(epoch from now())*1000,'offline',true));
 return record||'{"already_recorded":false}';
end $function$
;

create function app_private.schedule_notices(first_day date,last_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor();
begin
 perform app_private.assert_permission('events.manage');
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>365 then raise exception 'Choose a valid schedule range of up to one year.'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(c)-'created_by' order by c.starts_on,c.id),'[]')
 from public.rmc_calendar_closures c where c.starts_on<=last_day and c.ends_on>=first_day
 and (a.role_id='admin' or cardinality(c.node_ids)=0 or app_private.calendar_scope(c.node_ids,a.profile)
 or exists(select 1 from unnest(c.node_ids) n where app_private.in_scope(n))));
end $$;
create function public.rmc_schedule_notices(first_day date,last_day date) returns jsonb
language sql stable security invoker set search_path='' as $$ select app_private.schedule_notices(first_day,last_day) $$;
revoke all on function app_private.schedule_notices(date,date),public.rmc_schedule_notices(date,date) from public,anon,authenticated;
grant execute on function app_private.schedule_notices(date,date),public.rmc_schedule_notices(date,date) to authenticated;
