-- Ceremony dates are individual events. All checks use the Philippine calendar.
create or replace function app_private.ceremony_windows(ev jsonb, person jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select coalesce(ev->'ceremony'->'classWindows'->(person#>>'{school_data,academic_assignment,terminalGroupId}'),ev->'attendanceWindows','[]'::jsonb)
$$;
create or replace function app_private.ceremony_volunteer(ev jsonb, person jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(ev->>'kind'='flag_ceremony' and ev#>>'{ceremony,allowVolunteerMerit}'='true'
 and person->>'role' in ('student','mayor','ssg')
 and not coalesce(ev#>'{ceremony,exemptStudentIds}' ? (person->>'uid'),false)
 and (ev->>'scopeNodeId' is null or ev->>'scopeNodeId'=any(app_private.path(coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}')))),false)
$$;
create or replace function app_private.recipient(ev jsonb, person jsonb) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ids text[]; audience jsonb := ev->'audienceTarget'; g text; section text := person#>>'{school_data,academic_assignment,terminalGroupId}';
begin
 if ev#>'{ceremony,exemptStudentIds}' ? (person->>'uid') then return false; end if;
 ids := app_private.path(coalesce(person#>>'{official_data,assignment_node_id}',section));
 if ev->>'scopeNodeId' is not null and not coalesce(ev->>'scopeNodeId'=any(ids),false) then return false; end if;
 if audience->>'mode'='specific_people' then return coalesce(audience->'specificUserIds' ? (person->>'uid'),false); end if;
 if audience->>'mode'='directory_node' then
   return case when audience->>'includeDescendants'='false' then section=audience->>'nodeId' else audience->>'nodeId'=any(ids) end;
 end if;
 if jsonb_array_length(coalesce(audience->'groups',ev->'recipientGroups','[]')) > 0 then
  for g in select jsonb_array_elements_text(coalesce(audience->'groups',ev->'recipientGroups')) loop
   if (g='All Students' and person->>'role' in ('student','mayor','ssg')) or (g='All SSG Officers' and person->>'role'='ssg')
      or (g='All Mayors' and person->>'role'='mayor') or g='person:'||(person->>'uid')
      or (left(g,5)='node:' and substring(g from 6)=any(ids)) then return true; end if;
   if exists(select 1 from public.rmc_nodes where id=any(ids) and data->>'name'=case g when 'JHS' then 'Junior High School' when 'SHS' then 'Senior High School' else g end) then return true; end if;
  end loop;
  return false;
 end if;
 return coalesce(audience->>'mode'='all' or ev#>>'{target,all}'='true' or ev->>'participantsType'='all'
  or ev->'specificParticipants' ? (person->>'uid'),false);
end $$;


create or replace function app_private.validate_ceremony()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 d jsonb:=new.data; c jsonb:=d->'ceremony'; a public.rmc_profiles:=app_private.actor();
 day date:=(new.start_at at time zone 'Asia/Manila')::date; today date:=(now() at time zone 'Asia/Manila')::date;
 entry record; w jsonb; previous_end text; seen text[]; person_id text; node public.rmc_nodes;
begin
 if d->>'kind' is distinct from 'flag_ceremony' then
  if c is not null and c<>'null'::jsonb then raise exception 'Ceremony settings require a flag ceremony.'; end if;
  return new;
 end if;
 if tg_op='INSERT' or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at then
  if day<today or (date_trunc('month',day)<>date_trunc('month',today) and day>today+7) or new.start_at<now() then
   raise exception 'Create ceremonies only in the current month or next 7 days, before their start time.';
  end if;
  if day<>(new.end_at at time zone 'Asia/Manila')::date then raise exception 'Each flag ceremony must take place on one date.'; end if;
 end if;
 if c is null or c='null'::jsonb then return new; end if;
 if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'exemptStudentIds') is distinct from 'array'
  or jsonb_typeof(c->'classWindows') is distinct from 'object' or jsonb_typeof(c->'allowVolunteerMerit') is distinct from 'boolean'
  or jsonb_typeof(c->'volunteerMeritHours') is distinct from 'number' then raise exception 'Invalid ceremony settings.'; end if;
 if (c->>'allowVolunteerMerit')::boolean and (c->>'volunteerMeritHours')::numeric not between 0.01 and 24 then raise exception 'Volunteer merit must be between 0.01 and 24 hours.'; end if;
 if tg_op='UPDATE' and c is not distinct from old.data->'ceremony' then return new; end if;
 for person_id in select jsonb_array_elements_text(c->'exemptStudentIds') loop
  if not exists(select 1 from public.rmc_profiles p where p.id::text=person_id and p.role_id in ('student','mayor','ssg')
   and (a.role_id='admin' or app_private.in_scope(p.node_id))
   and (new.node_id is null or new.node_id=any(app_private.path(p.node_id)))) then
   raise exception 'Exempt students must be within your assigned ceremony scope.' using errcode='42501';
  end if;
 end loop;
 for entry in select * from jsonb_each(c->'classWindows') loop
  select * into node from public.rmc_nodes where id=entry.key;
  if node.id is null or node.data->>'type' not in ('section','block') or
   (a.role_id<>'admin' and not app_private.in_scope(node.id)) or
   (new.node_id is not null and not new.node_id=any(app_private.path(node.id))) then
   raise exception 'Class overrides must be within your assigned ceremony scope.' using errcode='42501';
  end if;
  if jsonb_typeof(entry.value)<>'array' or jsonb_array_length(entry.value)=0 then raise exception 'Class windows must be a nonempty list.'; end if;
  previous_end:=null; seen:='{}';
  for w in select value from jsonb_array_elements(entry.value) order by value->>'timeIn' loop
   if coalesce(w->>'id','')='' or (w->>'id')=any(seen)
    or coalesce(w->>'timeIn','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(w->>'timeOut','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or w->>'timeOut'<=w->>'timeIn' or w->>'timeIn'<previous_end
    or jsonb_typeof(w->'lateAfterMinutes') is distinct from 'number'
    or (w->>'lateAfterMinutes')::numeric<0 or trunc((w->>'lateAfterMinutes')::numeric)<>(w->>'lateAfterMinutes')::numeric then
    raise exception 'Class attendance windows require valid, non-overlapping times and a nonnegative whole-minute late threshold.';
   end if;
   if (day+(w->>'timeIn')::time) at time zone 'Asia/Manila'<new.start_at or (day+(w->>'timeOut')::time) at time zone 'Asia/Manila'>new.end_at then
    raise exception 'Class windows must fit inside the ceremony schedule.';
   end if;
   previous_end:=w->>'timeOut'; seen:=array_append(seen,w->>'id');
  end loop;
 end loop;
 return new;
end $$;
create trigger validate_ceremony before insert or update on public.rmc_events for each row execute function app_private.validate_ceremony();

create or replace function app_private.create_ceremonies(configuration jsonb, dates jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); day_text text; day date; d jsonb; result jsonb:='[]'; rid uuid; series uuid:=gen_random_uuid(); first_time time; last_time time;
begin
 if a.id is null then raise exception 'An active account is required.' using errcode='42501'; end if;
 perform app_private.assert_permission('events.manage');
 if configuration->>'kind' is distinct from 'flag_ceremony' then raise exception 'Only flag ceremonies can use this scheduler.'; end if;
 if jsonb_typeof(dates) is distinct from 'array' then raise exception 'Choose ceremony dates.'; end if;
 if jsonb_array_length(dates) not between 1 and 62 or (select count(distinct value) from jsonb_array_elements(dates))<>jsonb_array_length(dates) then raise exception 'Choose 1 to 62 unique ceremony dates.'; end if;
 select min((w->>'timeIn')::time),max((w->>'timeOut')::time) into first_time,last_time from (
  select value w from jsonb_array_elements(configuration->'attendanceWindows')
  union all select w.value from jsonb_each(coalesce(configuration#>'{ceremony,classWindows}','{}')) cw cross join lateral jsonb_array_elements(cw.value) w
 ) all_windows;
 if first_time is null or last_time is null then raise exception 'Add attendance windows.'; end if;
 for day_text in select jsonb_array_elements_text(dates) order by 1 loop
  if day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid ceremony date.'; end if;
  day:=day_text::date;
  d:=(configuration-'recurrence')||jsonb_build_object('startTime',extract(epoch from ((day+first_time) at time zone 'Asia/Manila'))*1000,
   'endTime',extract(epoch from ((day+last_time) at time zone 'Asia/Manila'))*1000,'startDate',day_text,'endDate',day_text,'status','upcoming');
  rid:=(app_private.command('createEvent',jsonb_build_array(d))#>>'{}')::uuid;
  update public.rmc_events set data=data||jsonb_build_object('seriesId',series) where id=rid;
  result:=result||to_jsonb(rid);
 end loop;
 return result;
end $$;
create or replace function public.rmc_create_ceremonies(configuration jsonb, dates jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.create_ceremonies(configuration,dates) $$;
-- Validate profile images and apply default attendance late rules consistently.
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
  earned:=case when volunteer then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else case e.data->>'kind' when 'service' then greatest(0,(stamp-(record->>'time_in')::numeric)/3600000) when 'merit' then coalesce((e.data->>'meritHours')::numeric,0) else 0 end end;
  if (volunteer or e.data->>'kind'='merit') and exists(select 1 from public.rmc_sanctions where source='merit:'||e.id::text||':'||p.id::text) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Service / merit: '||(e.data->>'title'),e.id,case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end); end if;
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',greatest(0,(stamp-(record->>'time_in')::numeric)/3600000),'deducted_hours',deducted);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $$;

create or replace function app_private.finalize_events() returns void language plpgsql security definer set search_path='' as $$
declare e public.rmc_events; p public.rmc_profiles; w jsonb; day date; slot_id text; penalty numeric; state text;
begin
 for e in select * from public.rmc_events where end_at<now() and finalized_at is null order by end_at for update skip locked limit 50 loop
  if e.data->>'cancellationStatus' is null and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   penalty:=coalesce((e.data#>>'{sanctionRules,absent,value}')::numeric,(e.data->>'penaltyValue')::numeric,0)/case when coalesce(e.data#>>'{sanctionRules,absent,unit}',e.data->>'penaltyUnit')='minutes' then 60 else 1 end;
   for p in select * from public.rmc_profiles where status='active' and role_id in ('student','mayor','ssg') and created_at<=e.start_at loop
    if not app_private.recipient(e.data,p.profile) then continue; end if;
    state:=case when exists(select 1 from public.rmc_excuses where event_id=e.id and student_id=p.id and data->>'status'='approved') then 'excused' else 'absent' end;
    for day in select generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day')::date loop
     for w in select value from jsonb_array_elements(case when jsonb_array_length(coalesce(e.data->'attendanceWindows','[]'))>0 then app_private.ceremony_windows(e.data,p.profile) else '[{"id":"default"}]' end) loop
      slot_id:=case when w->>'id'='default' then 'default' else day::text||':'||(w->>'id') end;
      insert into public.rmc_attendance values(e.id,p.id,slot_id,jsonb_build_object('status',state,'slot',slot_id,'scanned_by_name','System','recorded_at',extract(epoch from now())*1000)) on conflict do nothing;
      if found and state='absent' and penalty>0 then perform app_private.sanction(p.id,penalty,'Absent: '||(e.data->>'title'),e.id,'absent:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
     end loop;
    end loop;
   end loop;
  end if;
  update public.rmc_events set finalized_at=now(),data=data||'{"status":"done"}' where id=e.id;
 end loop;
 delete from app_private.qr_tokens where expires_at<now()-interval '1 hour';
end $$;
revoke all on function app_private.ceremony_windows(jsonb,jsonb),app_private.ceremony_volunteer(jsonb,jsonb),app_private.validate_ceremony(),app_private.create_ceremonies(jsonb,jsonb) from public,anon,authenticated;
grant execute on function app_private.create_ceremonies(jsonb,jsonb) to authenticated;
revoke all on function public.rmc_create_ceremonies(jsonb,jsonb) from public,anon;
grant execute on function public.rmc_create_ceremonies(jsonb,jsonb) to authenticated;

create or replace function app_private.can_read_event(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.rmc_events e, app_private.actor() a where e.id=target and
   (app_private.recipient(e.data,a.profile) or app_private.ceremony_volunteer(e.data,a.profile) or (app_private.permitted('events.manage') and (e.created_by=a.id or app_private.in_scope(e.node_id)))
    or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and exists
      (select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and (app_private.recipient(e.data,p.profile) or app_private.ceremony_volunteer(e.data,p.profile))))))
$$;
