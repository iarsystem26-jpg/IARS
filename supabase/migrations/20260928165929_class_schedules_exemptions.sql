-- Weekly class schedules use the existing directory snapshot and node RLS.
-- A dedicated RPC lets OSAS edit schedules without granting structure editing.
create or replace function app_private.guard_class_schedule()
returns trigger language plpgsql security invoker set search_path='' as $$
declare schedule jsonb:=new.data#>'{metadata,classSchedule}'; old_schedule jsonb; entry record; a public.rmc_profiles;
begin
 if tg_op='UPDATE' then old_schedule:=old.data#>'{metadata,classSchedule}'; end if;
 if schedule is not distinct from old_schedule then return new; end if;
 a:=app_private.actor();
 if a.id is null or a.role_id not in ('admin','ossa') or (a.role_id<>'admin' and not app_private.in_scope(new.id)) then
  raise exception 'Only OSAS and admins can change class schedules within their assigned scope.' using errcode='42501';
 end if;
 if schedule is null then return new; end if;
 if new.data->>'type' not in ('section','block') or coalesce(new.data#>>'{metadata,archived}','false')='true' then raise exception 'Choose an active class section or block.'; end if;
 if jsonb_typeof(schedule)<>'object' then raise exception 'Invalid weekly class schedule.'; end if;
 for entry in select * from jsonb_each(schedule) loop
  if entry.key !~ '^[0-6]$' or jsonb_typeof(entry.value)<>'object' or coalesce(entry.value->>'status','') not in ('classes','no_class') then raise exception 'Invalid class day.'; end if;
  if entry.value->>'status'='classes' and (
   coalesce(entry.value->>'timeIn','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
   coalesce(entry.value->>'timeOut','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
   entry.value->>'timeOut'<=entry.value->>'timeIn') then raise exception 'Class end time must be later than its valid start time.'; end if;
 end loop;
 return new;
end $$;
create trigger guard_class_schedule before insert or update on public.rmc_nodes for each row execute function app_private.guard_class_schedule();

create or replace function app_private.set_class_schedule(node_id text, schedule jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); n public.rmc_nodes;
begin
 if a.id is null or a.role_id not in ('admin','ossa') or (a.role_id<>'admin' and not app_private.in_scope(node_id)) then
  raise exception 'Only OSAS and admins can change class schedules within their assigned scope.' using errcode='42501';
 end if;
 select * into strict n from public.rmc_nodes where id=node_id for update;
 if n.data->>'type' not in ('section','block') or coalesce(n.data#>>'{metadata,archived}','false')='true' then raise exception 'Choose an active class section or block.'; end if;
 if schedule is null or jsonb_typeof(schedule)<>'object' then raise exception 'A weekly schedule object is required.'; end if;
 update public.rmc_nodes set data=jsonb_set(data,'{metadata}',coalesce(nullif(data->'metadata','null'::jsonb),'{}'::jsonb)||jsonb_build_object('classSchedule',schedule)) where id=node_id;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'class.schedule',node_id,jsonb_build_object('actor_name',a.profile->>'name','target_name',n.data->>'name','before',n.data#>'{metadata,classSchedule}','after',schedule));
end $$;
create or replace function public.rmc_set_class_schedule(node_id text, schedule jsonb)
returns void language sql security invoker set search_path='' as $$ select app_private.set_class_schedule(node_id,schedule) $$;
revoke all on function app_private.guard_class_schedule(), app_private.set_class_schedule(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.set_class_schedule(text,jsonb) to authenticated;
revoke all on function public.rmc_set_class_schedule(text,jsonb) from public,anon;
grant execute on function public.rmc_set_class_schedule(text,jsonb) to authenticated;

create or replace function app_private.create_ceremonies(configuration jsonb, dates jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); day_text text; day date; d jsonb; result jsonb:='[]'; rid uuid; series uuid:=gen_random_uuid(); first_time time; last_time time; exemptions jsonb:=configuration#>'{ceremony,exemptStudentIdsByDate}'; entry record;
begin
 if a.id is null then raise exception 'An active account is required.' using errcode='42501'; end if;
 perform app_private.assert_permission('events.manage');
 if configuration->>'kind' is distinct from 'flag_ceremony' then raise exception 'Only flag ceremonies can use this scheduler.'; end if;
 if jsonb_typeof(dates) is distinct from 'array' then raise exception 'Choose ceremony dates.'; end if;
 if jsonb_array_length(dates) not between 1 and 62 or (select count(distinct value) from jsonb_array_elements(dates))<>jsonb_array_length(dates) then raise exception 'Choose 1 to 62 unique ceremony dates.'; end if;
 if exemptions is not null then
  if jsonb_typeof(exemptions)<>'object' then raise exception 'Date-specific exemptions must be an object.'; end if;
  for entry in select * from jsonb_each(exemptions) loop
   if not dates ? entry.key or jsonb_typeof(entry.value)<>'array' then raise exception 'Exemptions must reference a selected ceremony date and a list of students.'; end if;
  end loop;
 end if;
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
  -- Snapshot each date independently; existing validation checks every student and scope.
  d:=jsonb_set(d,'{ceremony}',((configuration->'ceremony')-'exemptStudentIdsByDate')||jsonb_build_object('exemptStudentIds',
   (select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce(configuration#>'{ceremony,exemptStudentIds}','[]'::jsonb)||coalesce(exemptions->day_text,'[]'::jsonb)))));
  rid:=(app_private.command('createEvent',jsonb_build_array(d))#>>'{}')::uuid;
  update public.rmc_events set data=data||jsonb_build_object('seriesId',series) where id=rid;
  result:=result||to_jsonb(rid);
 end loop;
 return result;
end $$;
