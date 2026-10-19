-- Informational schedules are separate from events: attendance and finalization
-- jobs cannot create participation records or sanctions for these entries.
update public.rmc_roles set data=jsonb_set(data,'{permissions}',coalesce(data->'permissions','[]')||'["calendar.manage_schedules"]')
where (id in ('admin','ssg','ossa') or data->'permissions' ? 'calendar.manage_closures' or data->'permissions' ? 'events.manage')
and not (coalesce(data->'permissions','[]') ? 'calendar.manage_schedules');

create table public.rmc_calendar_schedules (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 3 and 200),
 description text not null default '' check (length(description)<=5000),
 venue text not null default '' check (length(venue)<=300),
 starts_at timestamptz not null, ends_at timestamptz not null,
 scope_node_id text references public.rmc_nodes(id),
 recipients text[] not null check (cardinality(recipients) between 1 and 100),
 created_by uuid not null references public.rmc_profiles(id),
 cancelled boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 check (ends_at>starts_at and ends_at<=starts_at+interval '366 days')
);
create index rmc_calendar_schedules_range_idx on public.rmc_calendar_schedules(starts_at,ends_at);
create index rmc_calendar_schedules_scope_idx on public.rmc_calendar_schedules(scope_node_id);
create index rmc_calendar_schedules_creator_idx on public.rmc_calendar_schedules(created_by);
alter table public.rmc_calendar_schedules enable row level security;
-- Access is exclusively through permission-checked RPCs; no direct client writes.
revoke all on public.rmc_calendar_schedules from public,anon,authenticated;
grant all on public.rmc_calendar_schedules to service_role;

create function app_private.schedule_manager() returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.calendar_allowed('calendar.manage_schedules') or app_private.calendar_allowed('calendar.manage_closures')
$$;
create function app_private.schedule_schoolwide() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.actor() where role_id='admin') or app_private.calendar_allowed('calendar.manage_schoolwide')
$$;
create function app_private.schedule_recipient(s public.rmc_calendar_schedules, person jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(app_private.recipient(jsonb_build_object('scopeNodeId',s.scope_node_id,'recipientGroups',to_jsonb(s.recipients)),person),false)
$$;
create function app_private.schedule_can_manage(s public.rmc_calendar_schedules) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.schedule_manager() and (app_private.schedule_schoolwide() or (s.scope_node_id is not null and app_private.in_scope(s.scope_node_id)))
$$;
create function app_private.notify_schedule(s public.rmc_calendar_schedules, previous public.rmc_calendar_schedules default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select p.id,'calendar-schedule:'||s.id||':'||s.revision,
 case when s.cancelled then 'Cancelled schedule: ' when s.revision>1 then 'Updated schedule: ' else 'New schedule: ' end||s.title,
 to_char(s.starts_at at time zone 'Asia/Manila','Mon DD, YYYY HH12:MI AM')||' to '||to_char(s.ends_at at time zone 'Asia/Manila','Mon DD, YYYY HH12:MI AM')||' (Manila). No attendance required. '||s.description,
 '/student/calendar'
 from public.rmc_profiles p where p.status='active' and
 (app_private.schedule_recipient(s,p.profile) or (previous.id is not null and app_private.schedule_recipient(previous,p.profile)))
 on conflict(user_id,source) do nothing;
end $$;

create function app_private.save_calendar_schedule(schedule_id uuid, draft jsonb) returns uuid
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
  if g not in ('All Students','All SSG Officers','All Mayors') then
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
create function app_private.cancel_calendar_schedule(schedule_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.rmc_calendar_schedules;
begin
 select * into s from public.rmc_calendar_schedules where id=schedule_id for update;
 if s.id is null or not app_private.schedule_can_manage(s) then raise exception 'Schedule unavailable or outside your scope.' using errcode='42501'; end if;
 perform app_private.assert_permission(case when app_private.calendar_allowed('calendar.manage_schedules') then 'calendar.manage_schedules' else 'calendar.manage_closures' end,case when app_private.schedule_schoolwide() then null else s.scope_node_id end);
 if s.cancelled then return; end if;
 if s.ends_at<=now() then raise exception 'Completed schedules cannot be cancelled.'; end if;
 update public.rmc_calendar_schedules set cancelled=true,revision=revision+1 where id=s.id returning * into s;
 perform app_private.notify_schedule(s);
end $$;
create function public.rmc_save_calendar_schedule(schedule_id uuid, draft jsonb) returns uuid
language sql security invoker set search_path='' as $$ select app_private.save_calendar_schedule(schedule_id,draft) $$;
create function public.rmc_cancel_calendar_schedule(schedule_id uuid) returns void
language sql security invoker set search_path='' as $$ select app_private.cancel_calendar_schedule(schedule_id) $$;
revoke all on function app_private.schedule_manager(),app_private.schedule_schoolwide(),app_private.schedule_recipient(public.rmc_calendar_schedules,jsonb),app_private.schedule_can_manage(public.rmc_calendar_schedules),app_private.notify_schedule(public.rmc_calendar_schedules,public.rmc_calendar_schedules),app_private.save_calendar_schedule(uuid,jsonb),app_private.cancel_calendar_schedule(uuid),public.rmc_save_calendar_schedule(uuid,jsonb),public.rmc_cancel_calendar_schedule(uuid) from public,anon,authenticated;
grant execute on function app_private.save_calendar_schedule(uuid,jsonb),app_private.cancel_calendar_schedule(uuid),public.rmc_save_calendar_schedule(uuid,jsonb),public.rmc_cancel_calendar_schedule(uuid) to authenticated;
-- Display-only activity details; retains existing calendar authorization and recipient filters.
CREATE OR REPLACE FUNCTION app_private.attendance_calendar(first_day date, last_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rmc_profiles:=app_private.actor(); items jsonb; closures jsonb;
begin
 perform app_private.assert_permission('calendar.view');
 if not app_private.calendar_allowed('calendar.view') then raise exception 'Permission required: calendar.view' using errcode='42501'; end if;
 if a.id is null then raise exception 'Sign in to view your calendar.' using errcode='42501'; end if;
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>62 then raise exception 'Choose a calendar range of up to 63 days.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text||':'||s.slot,'event_id',e.id,'parent_event_id',e.parent_event_id,'title',e.data->>'title','label',s.label,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'kind',case when e.organization_id is not null then 'organization' else e.data->>'kind' end,
 'organization_id',e.organization_id,'general',coalesce((e.data->>'isGeneralEvent')::boolean,false),
 'cancelled',e.data->>'cancellationStatus' is not null,'suspended',case when app_private.recipient(e.data,a.profile) then app_private.session_suspended(e,a.profile,(s.starts_at at time zone 'Asia/Manila')::date) else exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile)) and not exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile) and not app_private.session_suspended(e,p.profile,(s.starts_at at time zone 'Asia/Manila')::date)) end,
 'venue',coalesce(e.data->>'venue',''),'description',coalesce(e.data->>'description',''),
 'details',jsonb_build_object(
  'activity_kind',coalesce(e.data->>'kind','attendance'),'banner_url',e.data->>'bannerUrl',
  'starts_at',e.start_at,'ends_at',e.end_at,
  'parent_title',(select p.data->>'title' from public.rmc_events p where p.id=e.parent_event_id),
  'organization_name',(select o.name from public.rmc_organizations o where o.id=e.organization_id),
  'unit_name',(select n.data->>'name' from public.rmc_nodes n where n.id=e.node_id),
  'audience',case when e.data#>>'{audienceTarget,mode}'='specific_people' then 'Selected participants'
    else coalesce(nullif(e.data#>>'{audienceTarget,snapshotLabel}',''),case when e.data#>>'{audienceTarget,mode}'='all' then 'All students within the activity scope' else 'Selected academic groups' end) end,
  'approval',coalesce(e.data->>'approvalStatus','approved'),
  'windows',app_private.ceremony_windows(e.data,a.profile),
  'geofence_enabled',coalesce((e.data->>'geofenceEnabled')::boolean,false),'location',e.data->'location',
  'late_rule',coalesce(e.data#>'{sanctionRules,late}',jsonb_build_object('value',coalesce(e.data->'penaltyValue','0'),'unit',coalesce(e.data->>'penaltyUnit','hours'))),
  'absent_rule',coalesce(e.data#>'{sanctionRules,absent}',jsonb_build_object('value',coalesce(e.data->'penaltyValue','0'),'unit',coalesce(e.data->>'penaltyUnit','hours'))),
  'excuse_days',coalesce((e.data->>'excuseWindowDays')::int,3),
  'merit_hours',e.data->'meritHours','service_overflow',e.data#>>'{service,overflow}',
  'flag_kind',e.data#>>'{ceremony,flagKind}',
  'specific_activities',case when coalesce((e.data->>'isGeneralEvent')::boolean,false) then (
   select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.data->>'title','kind',coalesce(c.data->>'kind','attendance'),
    'starts_at',c.start_at,'ends_at',c.end_at,'venue',coalesce(c.data->>'venue',''),'description',coalesce(c.data->>'description',''),
    'cancelled',c.data->>'cancellationStatus' is not null,'windows',app_private.ceremony_windows(c.data,a.profile)) order by c.start_at,c.id),'[]')
   from public.rmc_events c where c.parent_event_id=e.id
   and (app_private.recipient(c.data,a.profile) or (app_private.calendar_allowed('calendar.view_scope') and (app_private.in_scope(c.node_id) or exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(c.data,p.profile)))))
   and c.data->>'approvalStatus' is distinct from 'pending' and c.data->>'approvalStatus' is distinct from 'rejected'
  ) else '[]'::jsonb end,
  'volunteer_merit_hours',case when (e.data#>>'{ceremony,allowVolunteerMerit}')::boolean then e.data#>'{ceremony,volunteerMeritHours}' else null end
 )) order by s.starts_at,e.id,s.slot),'[]') into items
 from public.rmc_events e cross join lateral app_private.calendar_sessions(e,a.profile) s
 where e.start_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and e.end_at>first_day::timestamp at time zone 'Asia/Manila'
 and (app_private.recipient(e.data,a.profile) or (app_private.calendar_allowed('calendar.view_scope') and (app_private.in_scope(e.node_id) or exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile))))) and e.data->>'approvalStatus' is distinct from 'pending' and e.data->>'approvalStatus' is distinct from 'rejected'
 and s.ends_at>s.starts_at and s.starts_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and s.ends_at>first_day::timestamp at time zone 'Asia/Manila';
 select coalesce(jsonb_agg(to_jsonb(c)-'created_by'-'node_ids' order by c.starts_on,c.id),'[]') into closures
 from public.rmc_calendar_closures c where c.starts_on<=last_day and c.ends_on>=first_day and (app_private.calendar_scope(c.node_ids,a.profile) or (app_private.calendar_allowed('calendar.view_scope') and (cardinality(c.node_ids)=0 or exists(select 1 from unnest(c.node_ids) n where app_private.in_scope(n)))));
 return jsonb_build_object('items',items,'closures',closures);
end $function$
;
revoke all on function app_private.attendance_calendar(date,date) from public,anon,authenticated;

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
   'audience',(select string_agg(case when left(g,5)='node:' then coalesce((select n.data->>'name' from public.rmc_nodes n where n.id=substring(g from 6)),'School unit') else g end,', ' order by g) from unnest(s.recipients) g),
   'can_manage',app_private.schedule_can_manage(s))
 ) order by s.starts_at,s.id),'[]') into schedules
 from public.rmc_calendar_schedules s
 where s.starts_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and s.ends_at>first_day::timestamp at time zone 'Asia/Manila'
 and (app_private.schedule_recipient(s,a.profile) or app_private.schedule_can_manage(s)
 or (app_private.calendar_allowed('calendar.view_scope') and (s.scope_node_id is null or app_private.in_scope(s.scope_node_id))));
 return jsonb_set(result,'{items}',(select coalesce(jsonb_agg(item order by item->>'starts_at',item->>'id'),'[]') from jsonb_array_elements((result->'items')||schedules) item));
end $$;
