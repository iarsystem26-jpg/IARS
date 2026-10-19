-- Role audiences retain existing approval, membership, exemption, and school-scope checks.
create or replace function app_private.recipient(ev jsonb, person jsonb) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ids text[]; audience jsonb := ev->'audienceTarget'; g text; section text := person#>>'{school_data,academic_assignment,terminalGroupId}';
begin
 if ev->>'approvalStatus' in ('pending','rejected') then return false; end if;
 if ev->>'organizationId' is not null then
  return ev->>'approvalStatus'='approved' and app_private.organization_member((ev->>'organizationId')::uuid,(person->>'uid')::uuid);
 end if;
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
      or (g='All Mayors' and person->>'role'='mayor')
      or (left(g,5)='role:' and substring(g from 6)<>'admin' and person->>'role'<>'admin'
          and exists(select 1 from public.rmc_roles where id=substring(g from 6))
          and (person->>'role'=substring(g from 6) or coalesce(person->'positionRoleIds','[]'::jsonb) ? substring(g from 6))) or g='person:'||(person->>'uid')
      or (left(g,5)='node:' and substring(g from 6)=any(ids)) then return true; end if;
   if left(g,5)='role:' then continue; end if;
   if exists(select 1 from public.rmc_nodes where id=any(ids) and data->>'name'=case g when 'JHS' then 'Junior High School' when 'SHS' then 'Senior High School' else g end) then return true; end if;
  end loop;
  return false;
 end if;
 return coalesce(audience->>'mode'='all' or ev#>>'{target,all}'='true' or ev->>'participantsType'='all'
  or ev->'specificParticipants' ? (person->>'uid'),false);
end $$;

create or replace function app_private.save_calendar_schedule(schedule_id uuid, draft jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); s public.rmc_calendar_schedules; previous public.rmc_calendar_schedules; g text; scope text:=nullif(draft->>'scope_node_id',''); groups text[];
begin
 if a.id is null or not app_private.schedule_manager() then raise exception 'Schedule management permission required.' using errcode='42501'; end if;
 perform app_private.assert_permission(case when app_private.calendar_allowed('calendar.manage_schedules') then 'calendar.manage_schedules' else 'calendar.manage_closures' end,case when app_private.schedule_schoolwide() then null else scope end);
 if scope is null and not app_private.schedule_schoolwide() then raise exception 'Choose a school unit within your assigned scope.' using errcode='42501'; end if;
 if scope is not null and (not exists(select 1 from public.rmc_nodes where id=scope) or (not app_private.schedule_schoolwide() and not app_private.in_scope(scope))) then raise exception 'School unit outside your assigned scope.' using errcode='42501'; end if;
 if jsonb_typeof(draft->'recipients') is distinct from 'array' then raise exception 'Choose recipients.'; end if;
 select array_agg(distinct value) into groups from jsonb_array_elements_text(draft->'recipients');
 if coalesce(cardinality(groups),0) not between 1 and 100 then raise exception 'Choose 1 to 100 recipient groups.'; end if;
 foreach g in array groups loop
  if left(g,5)='role:' then
   if substring(g from 6)='admin' or not exists(select 1 from public.rmc_roles where id=substring(g from 6)) then raise exception 'Invalid recipient role.'; end if;
  elsif g not in ('All Students','All SSG Officers','All Mayors') then
   if left(g,5)<>'node:' or not exists(select 1 from public.rmc_nodes n where n.id=substring(g from 6) and not coalesce((n.data#>>'{metadata,archived}')::boolean,false) and n.data#>>'{metadata,selectableForEvents}' is distinct from 'false') then raise exception 'Invalid recipient group.'; end if;
   if scope is not null and not scope=any(app_private.path(substring(g from 6))) then raise exception 'Recipients must be within the selected school unit.' using errcode='42501'; end if;
  end if;
 end loop;
 if draft->>'starts_at' is null or draft->>'ends_at' is null or (draft->>'starts_at')::timestamptz<=now() then raise exception 'Choose a future start and a valid end.'; end if;
 if schedule_id is not null then
  select * into previous from public.rmc_calendar_schedules where id=schedule_id for update;
  if previous.id is null or not app_private.schedule_can_manage(previous) then raise exception 'Schedule unavailable or outside your scope.' using errcode='42501'; end if;
  if previous.cancelled or previous.starts_at<=now() then raise exception 'Only upcoming schedules can be updated.'; end if;
  update public.rmc_calendar_schedules set title=btrim(draft->>'title'),description=coalesce(draft->>'description',''),venue=coalesce(draft->>'venue',''),
   starts_at=(draft->>'starts_at')::timestamptz,ends_at=(draft->>'ends_at')::timestamptz,scope_node_id=scope,recipients=groups,revision=revision+1 where id=schedule_id returning * into s;
 else
  insert into public.rmc_calendar_schedules(title,description,venue,starts_at,ends_at,scope_node_id,recipients,created_by)
   values(btrim(draft->>'title'),coalesce(draft->>'description',''),coalesce(draft->>'venue',''),(draft->>'starts_at')::timestamptz,(draft->>'ends_at')::timestamptz,scope,groups,a.id) returning * into s;
 end if;
 perform app_private.notify_schedule(s,previous);
 return s.id;
end $$;

create or replace function app_private.personal_calendar(first_day date,last_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); result jsonb; schedules jsonb;
begin
 -- The existing calendar enforces authentication, permission, and date bounds.
 result:=app_private.attendance_calendar(first_day,last_day);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'event_id',s.id,'title',s.title,'label','No attendance required',
  'starts_at',s.starts_at,'ends_at',s.ends_at,'kind','informational',
  'organization_id',null,'general',false,'cancelled',s.cancelled,'suspended',false,
  'venue',s.venue,'description',s.description,
  'schedule',jsonb_build_object('scope_node_id',s.scope_node_id,'recipients',s.recipients,
   'audience',(select string_agg(case when left(g,5)='node:' then coalesce((select n.data->>'name' from public.rmc_nodes n where n.id=substring(g from 6)),'School unit') when left(g,5)='role:' then case substring(g from 6) when 'ossa' then 'All OSSA Administrators' when 'ossa_staff' then 'All OSSA Staff' else 'All '||coalesce((select r.data->>'name' from public.rmc_roles r where r.id=substring(g from 6)),'Unavailable role') end else g end,', ' order by g) from unnest(s.recipients) g),
   'can_manage',app_private.schedule_can_manage(s))
 ) order by s.starts_at,s.id),'[]') into schedules
 from public.rmc_calendar_schedules s
 where s.starts_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and s.ends_at>first_day::timestamp at time zone 'Asia/Manila'
 and (app_private.schedule_recipient(s,a.profile) or app_private.schedule_can_manage(s)
 or (app_private.calendar_allowed('calendar.view_scope') and (s.scope_node_id is null or app_private.in_scope(s.scope_node_id))));
 return jsonb_set(result,'{items}',(select coalesce(jsonb_agg(item order by item->>'starts_at',item->>'id'),'[]') from jsonb_array_elements((result->'items')||schedules) item));
end $$;
