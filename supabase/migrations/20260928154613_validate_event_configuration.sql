-- Validate the persisted configuration even when callers bypass the form.
-- Authorization remains in the command gateway and existing RLS policies.
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
 if coalesce(d->>'status','') not in ('upcoming','active','done') then
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
  if jsonb_array_length(d->'attendanceWindows')=0 then
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

revoke all on function app_private.validate_event_configuration() from public, anon, authenticated;
create trigger validate_event_configuration
before insert or update of data, start_at, end_at on public.rmc_events
for each row execute function app_private.validate_event_configuration();
