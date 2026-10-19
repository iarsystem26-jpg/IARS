-- General events are containers; existing attendance events retain their behavior.
alter table public.rmc_events add column parent_event_id uuid
 generated always as (nullif(data->>'parentEventId','')::uuid) stored
 references public.rmc_events(id) on delete restrict;
create index rmc_events_parent_event_idx on public.rmc_events(parent_event_id);

create function app_private.validate_event_group() returns trigger
language plpgsql security invoker set search_path='' as $$
declare parent public.rmc_events; parent_id uuid:=nullif(new.data->>'parentEventId','')::uuid;
 is_general boolean:=coalesce((new.data->>'isGeneralEvent')::boolean,false);
begin
 if tg_op='UPDATE' and (coalesce(old.data->>'isGeneralEvent','false') is distinct from coalesce(new.data->>'isGeneralEvent','false')
   or nullif(old.data->>'parentEventId','') is distinct from nullif(new.data->>'parentEventId','')) then
  raise exception 'The event type and general event cannot be changed after creation.';
 end if;
 if is_general then
  if parent_id is not null or new.data->>'kind'<>'attendance'
   or coalesce((new.data#>>'{recurrence,occurrences}')::int,1)<>1
   or jsonb_array_length(coalesce(new.data->'attendanceWindows','[]'))<>0
   or coalesce((new.data->>'geofenceEnabled')::boolean,false)
   or greatest(coalesce((new.data->>'penaltyValue')::numeric,0),coalesce((new.data#>>'{sanctionRules,late,value}')::numeric,0),coalesce((new.data#>>'{sanctionRules,absent,value}')::numeric,0))<>0 then
   raise exception 'General events only define a duration. Configure attendance, locations and sanctions on specific events.';
  end if;
  if exists(select 1 from public.rmc_events c where c.parent_event_id=new.id and
    (c.start_at<new.start_at or c.end_at>new.end_at or c.node_id is distinct from new.node_id
     or (new.data->>'cancellationStatus' is not null and c.data->>'cancellationStatus' is null and c.end_at>now()))) then
   raise exception 'Keep all specific events within the general event duration and scope. Cancel upcoming specific events before cancelling the general event.';
  end if;
 end if;
 if parent_id is not null then
  if parent_id=new.id then raise exception 'An event cannot contain itself.'; end if;
  select * into parent from public.rmc_events where id=parent_id for update;
  if not found or coalesce(parent.data->>'isGeneralEvent','false')<>'true' then raise exception 'Select an available general event.'; end if;
  if new.node_id is distinct from parent.node_id or new.data->>'organizationId' is distinct from parent.data->>'organizationId' then
   raise exception 'Specific events must belong to the same school unit and organization as their general event.';
  end if;
  if new.start_at<parent.start_at or new.end_at>parent.end_at then raise exception 'Specific event dates must fit within the general event duration.'; end if;
  if tg_op='INSERT' and (parent.data->>'cancellationStatus' is not null or parent.end_at<=now()) then raise exception 'Cannot add specific events to an ended or cancelled general event.'; end if;
  new.data:=new.data||jsonb_build_object('parentEventTitle',parent.data->>'title');
 end if;
 return new;
end $$;
revoke all on function app_private.validate_event_group() from public,anon,authenticated;
create trigger z_validate_event_group before insert or update on public.rmc_events
 for each row execute function app_private.validate_event_group();

-- Block every attendance write path, including scanners and manual entry.
create function app_private.reject_general_event_attendance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.rmc_events e where e.id=new.event_id and e.data->>'isGeneralEvent'='true') then
  raise exception 'Take attendance on a specific event, not its general event.';
 end if;
 return new;
end $$;
revoke all on function app_private.reject_general_event_attendance() from public,anon,authenticated;
create trigger reject_general_event_attendance before insert or update on public.rmc_attendance
 for each row execute function app_private.reject_general_event_attendance();

create or replace function app_private.validate_event_configuration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 d jsonb := new.data;
 w jsonb;
 rule jsonb;
 previous_end text;
 ids text[] := '{}';
begin
 if jsonb_typeof(d) is distinct from 'object'
   or coalesce(length(trim(d->>'title')),0)=0
   or jsonb_typeof(d->'startTime') is distinct from 'number'
   or jsonb_typeof(d->'endTime') is distinct from 'number'
   or new.end_at <= new.start_at
   or new.end_at-new.start_at > interval '366 days' then
  raise exception 'Enter a title and a valid event schedule of at most one year.';
 end if;
 if d ? 'kind' and coalesce(d->>'kind','') not in ('attendance','service','merit','flag_ceremony') then
  raise exception 'Invalid event activity type.';
 end if;
 if d->>'kind'='merit' and (jsonb_typeof(d->'meritHours') is distinct from 'number' or (d->>'meritHours')::numeric<=0) then
  raise exception 'Merit hours must be positive.';
 end if;
 if coalesce(d->>'status','') not in ('upcoming','active','done','pending','rejected') then
  raise exception 'Invalid event status.';
 end if;
 if d ? 'recurrence' and d->'recurrence'<>'null'::jsonb then
  if coalesce(d#>>'{recurrence,frequency}','')<>'weekly'
    or jsonb_typeof(d#>'{recurrence,occurrences}') is distinct from 'number'
    or (d#>>'{recurrence,occurrences}')::numeric not between 1 and 52
    or trunc((d#>>'{recurrence,occurrences}')::numeric)<>(d#>>'{recurrence,occurrences}')::numeric then
   raise exception 'Choose 1 to 52 weekly occurrences.';
  end if;
 end if;
 -- Older events without windows still use their start/end as a single session.
 if d ? 'attendanceWindows' then
  if jsonb_typeof(d->'attendanceWindows') is distinct from 'array' then
   raise exception 'Attendance windows must be a list.';
  end if;
  if jsonb_array_length(d->'attendanceWindows')=0 and coalesce(d->>'isGeneralEvent','false')<>'true' then
   raise exception 'Add at least one attendance window.';
  end if;
  for w in select value from jsonb_array_elements(d->'attendanceWindows') order by value->>'timeIn' loop
   if coalesce(w->>'id','')='' or (w->>'id')=any(ids)
     or coalesce(w->>'timeIn','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(w->>'timeOut','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or w->>'timeOut'<=w->>'timeIn'
     or jsonb_typeof(w->'lateAfterMinutes') is distinct from 'number'
     or (w->>'lateAfterMinutes')::numeric<0 then
    raise exception 'Each attendance window needs a unique ID, valid times, and a nonnegative late threshold.';
   end if;
   if w->>'timeIn'<previous_end then raise exception 'Attendance windows must not overlap.'; end if;
   ids:=array_append(ids,w->>'id');
   previous_end:=w->>'timeOut';
  end loop;
 end if;
 for rule in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('value',d->'penaltyValue','unit',d->'penaltyUnit')
 ) || case when d ? 'sanctionRules' then jsonb_build_array(d#>'{sanctionRules,late}',d#>'{sanctionRules,absent}') else '[]'::jsonb end) loop
  if jsonb_typeof(rule->'value') is distinct from 'number' or (rule->>'value')::numeric<0
    or coalesce(rule->>'unit','') not in ('hours','minutes') then
   raise exception 'Sanctions require a nonnegative value and hours or minutes.';
  end if;
 end loop;
 if d ? 'geofenceEnabled' and jsonb_typeof(d->'geofenceEnabled') is distinct from 'boolean' then
  raise exception 'Geofencing must be enabled or disabled.';
 end if;
 if coalesce((d->>'geofenceEnabled')::boolean,true) then
  if jsonb_typeof(d#>'{location,lat}') is distinct from 'number'
    or jsonb_typeof(d#>'{location,lng}') is distinct from 'number'
    or jsonb_typeof(d#>'{location,radius_meters}') is distinct from 'number'
    or abs((d#>>'{location,lat}')::numeric)>90 or abs((d#>>'{location,lng}')::numeric)>180
    or (d#>>'{location,radius_meters}')::numeric not between 10 and 5000 then
   raise exception 'Enter valid coordinates and a radius between 10 and 5000 meters.';
  end if;
 end if;
 if d#>>'{audienceTarget,mode}'='group_list' then
  if jsonb_typeof(d#>'{audienceTarget,groups}') is distinct from 'array' then
   raise exception 'Select at least one recipient group.';
  end if;
  if jsonb_array_length(d#>'{audienceTarget,groups}')=0 or exists(
   select 1 from jsonb_array_elements(d#>'{audienceTarget,groups}') g
   where jsonb_typeof(g) is distinct from 'string' or length(trim(g#>>'{}'))=0
  ) then raise exception 'Select at least one recipient group.'; end if;
 end if;
 -- Editing one occurrence must retain its connection to the original series.
 if tg_op='UPDATE' and old.data->>'seriesId' is not null then
  new.data:=jsonb_set(new.data,'{seriesId}',old.data->'seriesId');
 end if;
 return new;
end $$;

create or replace function app_private.finalize_events() returns void language plpgsql security definer set search_path='' as $$
declare e public.rmc_events; p public.rmc_profiles; w jsonb; day date; slot_id text; penalty numeric; state text;
begin
 for e in select * from public.rmc_events where end_at<now() and finalized_at is null order by end_at for update skip locked limit 50 loop
  if coalesce(e.data->>'isGeneralEvent','false')<>'true' and e.data->>'cancellationStatus' is null and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
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
