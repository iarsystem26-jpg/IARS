-- Non-recipients may attend; the merit setting controls the reward only.
create or replace function app_private.ceremony_volunteer(ev jsonb, person jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(ev->>'kind'='flag_ceremony'
 and person->>'role' in ('student','mayor','ssg')
 and not coalesce(ev#>'{ceremony,exemptStudentIds}' ? (person->>'uid'),false)
 and (ev->>'scopeNodeId' is null or ev->>'scopeNodeId'=any(app_private.path(coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}')))),false)
$$;
create or replace function app_private.record_attendance(event_id uuid,student_id uuid,direction text,qr_token text,scan_position jsonb,manual_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb;
begin
 perform app_private.assert_permission('attendance.scan');
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 perform app_private.assert_permission('attendance.scan',p.node_id);
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is not null then
  if (app_private.resolve_qr(qr_token)->>'uid')::uuid<>p.id then raise exception 'QR does not match this student.'; end if;
 elsif coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 volunteer:=not app_private.recipient(e.data,p.profile) and app_private.ceremony_volunteer(e.data,p.profile);
 if not app_private.recipient(e.data,p.profile) and not volunteer then raise exception 'Student is not a recipient or eligible volunteer of this event.'; end if;
 if e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false) then raise exception 'Student is outside the ceremony scope.'; end if;
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
  select value into w from jsonb_array_elements(windows) where local_now::time between (value->>'timeIn')::time and (value->>'timeOut')::time limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record is not null then return record||'{"already_recorded":true}'; end if;
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
  earned:=case when volunteer then case when e.data#>>'{ceremony,allowVolunteerMerit}'='true' then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else 0 end else case e.data->>'kind' when 'service' then greatest(0,(stamp-(record->>'time_in')::numeric)/3600000) when 'merit' then coalesce((e.data->>'meritHours')::numeric,0) else 0 end end;
  if (volunteer or e.data->>'kind'='merit') and exists(select 1 from public.rmc_sanctions where source='merit:'||e.id::text||':'||p.id::text) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Service / merit: '||(e.data->>'title'),e.id,case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end); end if;
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',greatest(0,(stamp-(record->>'time_in')::numeric)/3600000),'deducted_hours',deducted);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $$;
