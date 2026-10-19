-- Earned merit is separate from sanctions; no negative sanction balances.
create table public.rmc_merit_credits (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.rmc_profiles(id) on delete restrict,
 event_id uuid not null references public.rmc_events(id) on delete restrict,
 source text not null unique,
 hours numeric(12,6) not null check(hours>0),
 created_at timestamptz not null default now(),
 actor_id uuid references public.rmc_profiles(id) on delete set null
);
create index rmc_merit_credits_student_idx on public.rmc_merit_credits(student_id);
create index rmc_merit_credits_event_idx on public.rmc_merit_credits(event_id);
create index rmc_merit_credits_actor_idx on public.rmc_merit_credits(actor_id);
alter table public.rmc_merit_credits enable row level security;
revoke all on public.rmc_merit_credits from public,anon,authenticated;
grant select on public.rmc_merit_credits to authenticated;
grant all on public.rmc_merit_credits to service_role;
create policy merit_read on public.rmc_merit_credits for select to authenticated using (
 (student_id=(select auth.uid()) and app_private.session_allowed())
 or ((app_private.permitted('ossa.manage_cases') or app_private.permitted('attendance.manage')) and app_private.can_read_profile(student_id))
);

create or replace function app_private.validate_activity_rewards()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); policy text:=coalesce(new.data#>>'{service,overflow}','clear'); c jsonb:=new.data->'ceremony'; phase text:=coalesce(c->>'flagKind','raising');
 previous_policy text:='clear';
begin
 if tg_op='UPDATE' then previous_policy:=coalesce(old.data#>>'{service,overflow}','clear'); end if;
 if policy not in ('clear','merit') then raise exception 'Invalid excess service hours policy.'; end if;
 if new.data->'service' is not null and new.data->'service'<>'null'::jsonb and
  (new.data->>'kind' is distinct from 'service' or jsonb_typeof(new.data->'service')<>'object') then raise exception 'Service settings require a service activity.'; end if;
 if policy<>previous_policy and (a.id is null or (a.role_id<>'admin' and not app_private.permitted('ossa.manage_cases'))) then
  raise exception 'Only OSAS or an administrator can change the excess service hours policy.' using errcode='42501';
 end if;
 if new.data->>'kind'='merit' and ((new.data->>'meritHours')::numeric not between 0.01 and 24) then raise exception 'Fixed merit must be between 0.01 and 24 hours.'; end if;
 if new.data->>'kind'='flag_ceremony' then
  if phase not in ('raising','retreat') then raise exception 'Choose flag raising or retreat.'; end if;
  if c ? 'useStandardSchedule' and jsonb_typeof(c->'useStandardSchedule') is distinct from 'boolean' then raise exception 'Standard schedule must be enabled or disabled.'; end if;
  if c->>'useStandardSchedule'='true' then
   if (phase='raising' and (extract(isodow from new.start_at at time zone 'Asia/Manila')<>1 or (new.end_at at time zone 'Asia/Manila')::time>'12:00'::time))
    or (phase='retreat' and (extract(isodow from new.start_at at time zone 'Asia/Manila')<>5 or (new.start_at at time zone 'Asia/Manila')::time<'12:00'::time)) then
    raise exception 'Standard flag raising is Monday morning; standard flag retreat is Friday afternoon. Adjust the dates/times or disable the standard toggle.';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.validate_activity_rewards() from public,anon,authenticated;
create trigger validate_activity_rewards before insert or update on public.rmc_events for each row execute function app_private.validate_activity_rewards();

create or replace function app_private.extend_service(event_id uuid,new_end_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); e public.rmc_events; new_end timestamptz;
begin
 if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=event_id for update;
 perform app_private.assert_permission('events.manage',e.node_id);
 if a.role_id<>'admin' and (e.node_id is null or not app_private.in_scope(e.node_id)) then raise exception 'Service is outside your assigned scope.' using errcode='42501'; end if;
 if e.data->>'kind'<>'service' or e.data->>'status'='done' or e.data->>'cancellationStatus' is not null or e.finalized_at is not null then raise exception 'Only an unarchived service activity can be extended.'; end if;
 if new_end_date is null or new_end_date<=(e.end_at at time zone 'Asia/Manila')::date or new_end_date<(now() at time zone 'Asia/Manila')::date then raise exception 'Choose a later service end date.'; end if;
 new_end:=(new_end_date+(e.end_at at time zone 'Asia/Manila')::time) at time zone 'Asia/Manila';
 if new_end<=now() or new_end-e.start_at>interval '366 days' then raise exception 'Service must end in the future and span at most one year.'; end if;
 update public.rmc_events set end_at=new_end,data=data||jsonb_build_object('endTime',extract(epoch from new_end)*1000,'endDate',new_end_date::text) where id=e.id;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'service.extend',e.id::text,jsonb_build_object('previous_end',e.end_at,'new_end',new_end));
 return jsonb_build_object('id',e.id,'endDate',new_end_date);
end $$;
create or replace function public.rmc_extend_service(event_id uuid,new_end_date date)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.extend_service(event_id,new_end_date) $$;
revoke all on function app_private.extend_service(uuid,date),public.rmc_extend_service(uuid,date) from public,anon,authenticated;
grant execute on function app_private.extend_service(uuid,date),public.rmc_extend_service(uuid,date) to authenticated;

create or replace function app_private.record_attendance(event_id uuid,student_id uuid,direction text,qr_token text,scan_position jsonb,manual_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
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
    where not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
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
end $$;

create or replace function public.rmc_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'profiles',coalesce((select jsonb_agg(profile||jsonb_build_object('uid',id,'role',role_id,'account_status',status)) from public.rmc_profiles),'[]'),
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'data',data)) from public.rmc_nodes),'[]'),
 'roles',coalesce((select jsonb_object_agg(id,data) from public.rmc_roles),'{}'),
 'applications',coalesce((select jsonb_agg(data) from public.rmc_applications),'[]'),
 'events',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'status',case when data->>'status'='done' or end_at<now() then 'done' when start_at<=now() then 'active' else 'upcoming' end)) from public.rmc_events),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('event_id',event_id,'student_id',student_id,'slot',slot,'data',data)) from public.rmc_attendance),'[]'),
 'merit_credits',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'event_id',event_id,'hours',hours)) from public.rmc_merit_credits),'[]'),
 'sanctions',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'data',data||jsonb_build_object('id',id))) from public.rmc_sanctions),'[]'),
 'excuses',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'event_id',event_id)) from public.rmc_excuses),'[]'),
 'settings',coalesce((select jsonb_object_agg(id,data) from public.rmc_settings),'{}'),
 'audit',coalesce((select jsonb_agg(row_data) from (select data||jsonb_build_object('id',id,'action',action,'actor_uid',actor_id,'target_uid',target,'timestamp',extract(epoch from created_at)*1000) row_data from public.rmc_audit order by created_at desc limit 500) logs),'[]')
 )
$$;
