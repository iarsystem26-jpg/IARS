-- Display-only activity details; retains existing calendar authorization and recipient filters.
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
