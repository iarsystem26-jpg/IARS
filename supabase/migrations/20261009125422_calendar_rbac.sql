-- Calendar capabilities use saved role permissions, including for administrators.
update public.rmc_roles set data=jsonb_set(data,'{permissions}',coalesce(data->'permissions','[]')||'["calendar.view"]') where id in ('admin','ossa','ossa_staff','ssg','mayor','student') and not (coalesce(data->'permissions','[]') ? 'calendar.view');
update public.rmc_roles set data=jsonb_set(data,'{permissions}',coalesce(data->'permissions','[]')||'["calendar.view_scope"]') where id in ('admin','ossa','ossa_staff') and not (coalesce(data->'permissions','[]') ? 'calendar.view_scope');
update public.rmc_roles set data=jsonb_set(data,'{permissions}',coalesce(data->'permissions','[]')||'["calendar.manage_closures","calendar.manage_schoolwide"]') where id='admin';
create function app_private.calendar_allowed(permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.actor() a join public.rmc_roles r on r.id=a.role_id where not coalesce((r.data->>'isPositionOnly')::boolean,false) and r.data->'permissions' ? permission)
$$;
revoke all on function app_private.calendar_allowed(text) from public,anon,authenticated;
create or replace function app_private.calendar_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.calendar_allowed('calendar.manage_closures') then raise exception 'Permission required: calendar.manage_closures' using errcode='42501'; end if;
 perform app_private.assert_permission('calendar.manage_closures');
end $$;
create or replace function app_private.list_closures() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.calendar_admin();
 return (select coalesce(jsonb_agg(to_jsonb(c) order by starts_on desc,created_at desc),'[]') from public.rmc_calendar_closures c where app_private.calendar_allowed('calendar.manage_schoolwide') or cardinality(c.node_ids)=0 or exists(select 1 from unnest(c.node_ids) n where app_private.in_scope(n)));
end $$;
CREATE OR REPLACE FUNCTION app_private.preview_closure(first_day date, last_day date, nodes text[], shift_days integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare activities jsonb; token text;
begin
 perform app_private.calendar_admin();
 if first_day is null or last_day is null or first_day<(now() at time zone 'Asia/Manila')::date or last_day<first_day or last_day-first_day>365
 or nodes is null or cardinality(nodes)>100 or shift_days is null or shift_days not between 0 and 366 then raise exception 'Choose valid dates from today onwards, academic units, and a shift of 0–366 days.'; end if;
 if exists(select 1 from unnest(nodes) n where not exists(select 1 from public.rmc_nodes where id=n)) then raise exception 'An academic unit no longer exists.'; end if;
 if not app_private.calendar_allowed('calendar.manage_schoolwide') then
  if cardinality(nodes)=0 then raise exception 'School-wide suspension permission required.' using errcode='42501'; end if;
  if exists(select 1 from unnest(nodes) n where not app_private.in_scope(n)) then raise exception 'This academic unit is outside your assigned scope.' using errcode='42501'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.data->>'title','kind',e.data->>'kind',
 'starts_at',e.start_at,'ends_at',e.end_at,'organization',e.organization_id is not null,
 'affected',r.affected,'unaffected',r.total-r.affected,'can_change',r.total>0 and r.total=r.affected
 and (e.start_at at time zone 'Asia/Manila')::date>=first_day and e.end_at<=((last_day+1)::timestamp at time zone 'Asia/Manila')
 and e.start_at>now() and e.data->>'isGeneralEvent' is distinct from 'true'
 and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id)
 and (shift_days=0 or (e.data->>'kind'<>'flag_ceremony' and ((e.start_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila')::date>last_day
 and (e.parent_event_id is null or exists(select 1 from public.rmc_events parent where parent.id=e.parent_event_id and e.start_at+make_interval(days=>shift_days)>=parent.start_at and e.end_at+make_interval(days=>shift_days)<=parent.end_at)))),
 'revision',md5(e.data::text||e.start_at::text||e.end_at::text),
 'new_starts_at',e.start_at+make_interval(days=>shift_days),'new_ends_at',e.end_at+make_interval(days=>shift_days)) order by e.start_at,e.id),'[]') into activities
 from public.rmc_events e cross join lateral (
 select count(*) total,count(*) filter(where app_private.calendar_scope(nodes,p.profile)) affected
 from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor','ssg')
 and app_private.recipient(e.data||jsonb_build_object('approvalStatus','approved'),p.profile)) r
 where e.start_at < (last_day+1)::timestamp at time zone 'Asia/Manila' and e.end_at>first_day::timestamp at time zone 'Asia/Manila'
 and e.data->>'cancellationStatus' is null
 and (r.affected>0 or (r.total=0 and (cardinality(nodes)=0 or nodes && app_private.path(e.node_id))));
 token:=md5(jsonb_build_array(first_day,last_day,nodes,shift_days,activities,(select coalesce(jsonb_agg(id order by id),'[]') from public.rmc_calendar_closures))::text);
 return jsonb_build_object('activities',activities,'token',token);
end $function$
;
CREATE OR REPLACE FUNCTION app_private.personal_calendar(first_day date, last_day date)
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
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text||':'||s.slot,'event_id',e.id,'title',e.data->>'title','label',s.label,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'kind',case when e.organization_id is not null then 'organization' else e.data->>'kind' end,
 'organization_id',e.organization_id,'general',coalesce((e.data->>'isGeneralEvent')::boolean,false),
 'cancelled',e.data->>'cancellationStatus' is not null,'suspended',case when app_private.recipient(e.data,a.profile) then app_private.session_suspended(e,a.profile,(s.starts_at at time zone 'Asia/Manila')::date) else exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile)) and not exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile) and not app_private.session_suspended(e,p.profile,(s.starts_at at time zone 'Asia/Manila')::date)) end,
 'venue',coalesce(e.data->>'venue',''),'description',coalesce(e.data->>'description','')) order by s.starts_at,e.id,s.slot),'[]') into items
 from public.rmc_events e cross join lateral app_private.calendar_sessions(e,a.profile) s
 where e.start_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and e.end_at>first_day::timestamp at time zone 'Asia/Manila'
 and (app_private.recipient(e.data,a.profile) or (app_private.calendar_allowed('calendar.view_scope') and (app_private.in_scope(e.node_id) or exists(select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile))))) and e.data->>'approvalStatus' is distinct from 'pending' and e.data->>'approvalStatus' is distinct from 'rejected'
 and s.ends_at>s.starts_at and s.starts_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and s.ends_at>first_day::timestamp at time zone 'Asia/Manila';
 select coalesce(jsonb_agg(to_jsonb(c)-'created_by'-'node_ids' order by c.starts_on,c.id),'[]') into closures
 from public.rmc_calendar_closures c where c.starts_on<=last_day and c.ends_on>=first_day and (app_private.calendar_scope(c.node_ids,a.profile) or (app_private.calendar_allowed('calendar.view_scope') and (cardinality(c.node_ids)=0 or exists(select 1 from unnest(c.node_ids) n where app_private.in_scope(n)))));
 return jsonb_build_object('items',items,'closures',closures);
end $function$
;
