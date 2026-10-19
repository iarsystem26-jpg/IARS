-- Date-based rescheduling with atomic general/specific event validation.
CREATE OR REPLACE FUNCTION app_private.enforce_event_recipient_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 a public.rmc_profiles := app_private.actor();
 audience jsonb := new.data->'audienceTarget';
 recipient text;
begin
 if new.organization_id is not null then return new; end if;
 -- Scheduled maintenance has no actor; its updates do not select recipients.
 if a.id is null or a.role_id='admin' then return new; end if;
 if tg_op='UPDATE' and app_private.calendar_allowed('calendar.manage_closures') and app_private.calendar_allowed('calendar.manage_schoolwide')
 and new.data->'audienceTarget' is not distinct from old.data->'audienceTarget'
 and new.data->'recipientGroups' is not distinct from old.data->'recipientGroups'
 and new.data->'specificParticipants' is not distinct from old.data->'specificParticipants'
 and new.node_id is not distinct from old.node_id then return new; end if;
 if a.node_id is null or new.node_id is null or not app_private.in_scope(new.node_id) then
  raise exception 'This event is outside your assigned unit.' using errcode='42501';
 end if;
 -- Allow closing existing records without revalidating legacy audience labels.
 if tg_op='UPDATE' and new.data->'audienceTarget' is not distinct from old.data->'audienceTarget'
   and new.data->'recipientGroups' is not distinct from old.data->'recipientGroups'
   and new.data->'specificParticipants' is not distinct from old.data->'specificParticipants'
   and new.node_id is not distinct from old.node_id then return new; end if;
 if audience->>'mode'='directory_node' and not app_private.in_scope(audience->>'nodeId') then
  raise exception 'Select recipients only within your assigned unit.' using errcode='42501';
 end if;
 for recipient in select jsonb_array_elements_text(coalesce(audience->'groups',new.data->'recipientGroups','[]')) loop
  if left(recipient,5)='node:' and not app_private.in_scope(substring(recipient from 6)) then
   raise exception 'Select recipients only within your assigned unit.' using errcode='42501';
  end if;
  if left(recipient,7)='person:' and not exists(
   select 1 from public.rmc_profiles p where p.id::text=substring(recipient from 8) and app_private.in_scope(p.node_id)
  ) then raise exception 'Select people only within your assigned unit.' using errcode='42501'; end if;
 end loop;
 for recipient in select jsonb_array_elements_text(coalesce(audience->'specificUserIds',new.data->'specificParticipants','[]')) loop
  if not exists(select 1 from public.rmc_profiles p where p.id::text=recipient and app_private.in_scope(p.node_id)) then
   raise exception 'Select people only within your assigned unit.' using errcode='42501';
  end if;
 end loop;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.validate_event_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    (c.node_id is distinct from new.node_id
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
  if tg_op='INSERT' and (new.start_at<parent.start_at or new.end_at>parent.end_at) then raise exception 'Specific event dates must fit within the general event duration.'; end if;
  if tg_op='INSERT' and (parent.data->>'cancellationStatus' is not null or parent.end_at<=now()) then raise exception 'Cannot add specific events to an ended or cancelled general event.'; end if;
  new.data:=new.data||jsonb_build_object('parentEventTitle',parent.data->>'title');
 end if;
 return new;
end $function$
;

create function app_private.preview_closure_schedule(first_day date,last_day date,nodes text[],plans jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb; ids uuid[]; moves jsonb:='{}'; result jsonb:='[]'; errors jsonb:='[]'; entry jsonb; ev public.rmc_events;
 total integer; affected integer; movable boolean; why text; delta integer; target date; child record; group_ok boolean; moved integer:=0;
begin
 base:=app_private.preview_closure(first_day,last_day,nodes,0);
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans)>500 then raise exception 'Choose up to 500 activities and destination dates.'; end if;
 select array_agg(distinct id) into ids from (
  select (x->>'id')::uuid id from jsonb_array_elements(base->'activities') x
  union select e.parent_event_id from public.rmc_events e where e.id in (select (x->>'id')::uuid from jsonb_array_elements(base->'activities') x) and e.parent_event_id is not null
  union select c.id from public.rmc_events c where c.parent_event_id in (
   select (x->>'id')::uuid from jsonb_array_elements(base->'activities') x
   union select e.parent_event_id from public.rmc_events e where e.id in (select (x->>'id')::uuid from jsonb_array_elements(base->'activities') x))
 ) candidates;
 for entry in select value from jsonb_array_elements(plans) loop
  if entry->>'event_id' is null or entry->>'date' is null then raise exception 'Choose an activity and its new date.'; end if;
  select * into ev from public.rmc_events where id=(entry->>'event_id')::uuid and id=any(ids);
  if not found then raise exception 'Refresh the affected activity list before selecting dates.'; end if;
  target:=(entry->>'date')::date;
  delta:=target-(ev.start_at at time zone 'Asia/Manila')::date;
  if target<=last_day or delta not between 1 and 366 then raise exception 'Choose a new date after the suspension, within 366 days of the original start.'; end if;
  if moves ? ev.id::text then raise exception 'An activity was selected more than once.'; end if;
  moves:=moves||jsonb_build_object(ev.id::text,delta);
 end loop;
 -- A general event moves as one group, retaining every child's relative schedule.
 for ev in select * from public.rmc_events where id=any(ids) and data->>'isGeneralEvent'='true' and moves ? id::text loop
  delta:=(moves->>ev.id::text)::integer;
  for child in select id from public.rmc_events where parent_event_id=ev.id loop
   if moves ? child.id::text and (moves->>child.id::text)::integer<>delta then raise exception 'A specific activity must move with its selected general event. Choose the general event date only.'; end if;
   moves:=moves||jsonb_build_object(child.id::text,delta);
  end loop;
 end loop;
 if (select count(*) from jsonb_object_keys(moves))>500 then raise exception 'The general event group exceeds 500 activities.'; end if;
 for ev in select * from public.rmc_events where id=any(ids) order by coalesce(parent_event_id,id), case when data->>'isGeneralEvent'='true' then 0 else 1 end,start_at,id loop
  select count(*),count(*) filter(where app_private.calendar_scope(nodes,p.profile)) into total,affected
  from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor','ssg') and app_private.recipient(ev.data||'{"approvalStatus":"approved"}',p.profile);
  group_ok:=true;
  if ev.data->>'isGeneralEvent'='true' then
   group_ok:=not exists(select 1 from public.rmc_events c where c.parent_event_id=ev.id and
    (c.start_at<=now() or c.data->>'cancellationStatus' is not null or c.data->>'kind'='flag_ceremony' or exists(select 1 from public.rmc_attendance t where t.event_id=c.id)
     or exists(select 1 from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor','ssg') and app_private.recipient(c.data||'{"approvalStatus":"approved"}',p.profile) and not app_private.calendar_scope(nodes,p.profile))));
  end if;
  movable:=(total>0 or (ev.data->>'isGeneralEvent'='true' and exists(select 1 from public.rmc_events c where c.parent_event_id=ev.id))) and total=affected
   and ev.start_at>now() and ev.data->>'cancellationStatus' is null and ev.data->>'kind' is distinct from 'flag_ceremony'
   and not exists(select 1 from public.rmc_attendance t where t.event_id=ev.id) and group_ok;
  why:=case when ev.data->>'kind'='flag_ceremony' then 'Review ceremony exemptions and class attendance windows in the ceremony editor before rescheduling.'
   when not group_ok then 'A specific activity is shared, cancelled, already started, has attendance, or requires ceremony review. Move eligible specific activities individually.'
   when not movable then 'This activity is shared, already started, cancelled, has attendance, or has no affected recipients.' else null end;
  -- Related activities outside the selected academic scope must not disclose their details.
  if affected=0 and cardinality(nodes)>0 and not nodes && app_private.path(ev.node_id) and ev.data->>'isGeneralEvent' is distinct from 'true' then
   if moves ? ev.id::text then errors:=errors||jsonb_build_array('A specific activity is outside the selected academic scope.'); end if;
   continue;
  end if;
  delta:=(moves->>ev.id::text)::integer;
  if delta is not null then
   moved:=moved+1;
   if not movable then errors:=errors||jsonb_build_array((ev.data->>'title')||': '||why); end if;
   if ev.parent_event_id is not null and not exists(select 1 from public.rmc_events parent where parent.id=ev.parent_event_id
    and ev.start_at+make_interval(days=>delta)>=parent.start_at+make_interval(days=>coalesce((moves->>parent.id::text)::integer,0))
    and ev.end_at+make_interval(days=>delta)<=parent.end_at+make_interval(days=>coalesce((moves->>parent.id::text)::integer,0)))
   then errors:=errors||jsonb_build_array((ev.data->>'title')||': the new dates must stay inside the general event. Move the general event group or choose another date.'); end if;
   if exists(select 1 from public.rmc_calendar_closures c where ev.start_at+make_interval(days=>delta)<((c.ends_on+1)::timestamp at time zone 'Asia/Manila')
    and ev.end_at+make_interval(days=>delta)>(c.starts_on::timestamp at time zone 'Asia/Manila')
    and exists(select 1 from public.rmc_profiles p where p.status='active' and app_private.recipient(ev.data||'{"approvalStatus":"approved"}',p.profile) and app_private.calendar_scope(c.node_ids,p.profile)))
   then errors:=errors||jsonb_build_array((ev.data->>'title')||': the destination overlaps a saved holiday or suspension.'); end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('id',ev.id,'title',ev.data->>'title','kind',ev.data->>'kind','general',ev.data->>'isGeneralEvent'='true',
   'parent_event_id',ev.parent_event_id,'parent_title',(select data->>'title' from public.rmc_events where id=ev.parent_event_id),
   'starts_at',ev.start_at,'ends_at',ev.end_at,'description',coalesce(ev.data->>'description',''),'venue',coalesce(ev.data->>'venue',''),
   'attendance_windows',coalesce(ev.data->'attendanceWindows','[]'),'approval_status',coalesce(ev.data->>'approvalStatus','approved'),
   'organization',ev.organization_id is not null,'affected',affected,'unaffected',total-affected,'can_change',movable,'disabled_reason',why,
   'move_days',delta,'new_starts_at',ev.start_at+make_interval(days=>coalesce(delta,0)),'new_ends_at',ev.end_at+make_interval(days=>coalesce(delta,0)),
   'revision',md5(ev.data::text||ev.start_at::text||ev.end_at::text)));
 end loop;
 return jsonb_build_object('activities',result,'plan_valid',jsonb_array_length(errors)=0,'errors',errors,'moved_count',moved,
  'token',md5(jsonb_build_array(base->>'token',plans,moves,result,errors)::text));
end $$;

-- Keep group checks immediate for ordinary edits; the calendar transaction defers
-- date containment until all parent and child rows have moved together.
create function app_private.check_calendar_group_dates() returns trigger language plpgsql security definer set search_path='' as $$
declare ev public.rmc_events; parent public.rmc_events;
begin
 select * into ev from public.rmc_events where id=new.id;
 if not found then return null; end if;
 if ev.data->>'isGeneralEvent'='true' then
  if exists(select 1 from public.rmc_events c where c.parent_event_id=ev.id and (c.start_at<ev.start_at or c.end_at>ev.end_at or c.node_id is distinct from ev.node_id
   or (ev.data->>'cancellationStatus' is not null and c.data->>'cancellationStatus' is null and c.end_at>now()))) then raise exception 'Keep all specific events within the general event duration and scope.'; end if;
 elsif ev.parent_event_id is not null then
  select * into parent from public.rmc_events where id=ev.parent_event_id;
  if ev.start_at<parent.start_at or ev.end_at>parent.end_at then raise exception 'Specific event dates must fit within the general event duration.'; end if;
 end if;
 return null;
end $$;
revoke all on function app_private.check_calendar_group_dates() from public,anon,authenticated;
create constraint trigger calendar_event_group_dates after insert or update on public.rmc_events deferrable initially immediate for each row execute function app_private.check_calendar_group_dates();

create function app_private.apply_closure_schedule(first_day date,last_day date,nodes text[],closure_title text,explanation text,closure_kind text,plans jsonb,expected_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); checked jsonb; row jsonb; ev public.rmc_events; cid uuid; delta integer;
begin
 perform app_private.calendar_admin();
 perform pg_advisory_xact_lock(hashtext('rmc-calendar-closures'));
 -- Recheck after locks, including siblings added since the preview.
 checked:=app_private.preview_closure_schedule(first_day,last_day,nodes,plans);
 perform 1 from public.rmc_events where id in (select (x->>'id')::uuid from jsonb_array_elements(checked->'activities') x) order by id for update;
 checked:=app_private.preview_closure_schedule(first_day,last_day,nodes,plans);
 if expected_token is distinct from checked->>'token' then raise exception 'Schedules changed. Refresh the new schedule preview before applying.'; end if;
 if (checked->>'plan_valid')::boolean is not true or (checked->>'moved_count')::integer=0 then raise exception 'Choose valid destination dates and review the schedule preview.'; end if;
 -- Use the established closure path for notification, sanction reconciliation and audit.
 cid:=app_private.apply_closure(first_day,last_day,nodes,closure_title,explanation,closure_kind,'suspend','{}',0,app_private.preview_closure(first_day,last_day,nodes,0)->>'token');
 set constraints public.calendar_event_group_dates deferred;
 for row in select value from jsonb_array_elements(checked->'activities') where value->>'move_days' is not null loop
  select * into strict ev from public.rmc_events where id=(row->>'id')::uuid;
  delta:=(row->>'move_days')::integer;
  update public.rmc_events set start_at=ev.start_at+make_interval(days=>delta),end_at=ev.end_at+make_interval(days=>delta),data=data||jsonb_build_object(
   'startTime',extract(epoch from ev.start_at+make_interval(days=>delta))*1000,'endTime',extract(epoch from ev.end_at+make_interval(days=>delta))*1000,
   'startDate',to_char((ev.start_at+make_interval(days=>delta)) at time zone 'Asia/Manila','YYYY-MM-DD'),
   'endDate',to_char((ev.end_at+make_interval(days=>delta)) at time zone 'Asia/Manila','YYYY-MM-DD')) where id=ev.id;
  insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'calendar.reschedule',ev.id::text,jsonb_build_object('closure_id',cid,'before',ev.data,'new_date',row->>'new_starts_at','shift_days',delta,'reason',explanation));
 end loop;
 set constraints public.calendar_event_group_dates immediate;
 return cid;
end $$;
create function public.rmc_preview_closure_schedule(first_day date,last_day date,nodes text[],plans jsonb default '[]') returns jsonb language sql security invoker set search_path='' as $$ select app_private.preview_closure_schedule(first_day,last_day,nodes,plans) $$;
create function public.rmc_apply_closure_schedule(first_day date,last_day date,nodes text[],closure_title text,explanation text,closure_kind text,plans jsonb,expected_token text) returns uuid language sql security invoker set search_path='' as $$ select app_private.apply_closure_schedule(first_day,last_day,nodes,closure_title,explanation,closure_kind,plans,expected_token) $$;
revoke all on function app_private.preview_closure_schedule(date,date,text[],jsonb), app_private.apply_closure_schedule(date,date,text[],text,text,text,jsonb,text), public.rmc_preview_closure_schedule(date,date,text[],jsonb), public.rmc_apply_closure_schedule(date,date,text[],text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function app_private.preview_closure_schedule(date,date,text[],jsonb), app_private.apply_closure_schedule(date,date,text[],text,text,text,jsonb,text), public.rmc_preview_closure_schedule(date,date,text[],jsonb), public.rmc_apply_closure_schedule(date,date,text[],text,text,text,jsonb,text) to authenticated;
