-- Granular RBAC defaults. Preserve other administrator customizations.
update public.rmc_roles set data=jsonb_set(data,'{permissions}',coalesce(data->'permissions','[]')||'"directory.create_units"'::jsonb)
where id<>'ssg' and data->'permissions' ? 'directory.manage_structure' and not data->'permissions' ? 'directory.create_units';
update public.rmc_roles set data=jsonb_set(data,'{permissions}',(coalesce(data->'permissions','[]')-'directory.create_units'-'events.require_ossa_approval')||'"events.require_ossa_approval"'::jsonb) where id='ssg';
update public.rmc_roles set data=jsonb_set(data,'{permissions}',(coalesce(data->'permissions','[]')-'events.approve')||'"events.approve"'::jsonb) where id='ossa';

create function app_private.enforce_unit_creation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform app_private.assert_permission('directory.create_units',new.parent_id);
 return new;
end $$;
revoke all on function app_private.enforce_unit_creation() from public,anon,authenticated;
create trigger enforce_unit_creation before insert on public.rmc_nodes for each row execute function app_private.enforce_unit_creation();

create or replace function app_private.validate_organization_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare o public.rmc_organizations; a public.rmc_profiles:=app_private.actor(); changed boolean; needs_review boolean;
begin
 if tg_op='UPDATE' and (new.data->>'organizationId' is distinct from old.data->>'organizationId' or new.organization_id is distinct from old.organization_id) then
  raise exception 'An event cannot be moved into or out of an organization.';
 end if;
 if nullif(new.data->>'organizationId','') is null and new.organization_id is null then return new; end if;
 new.organization_id:=(new.data->>'organizationId')::uuid;
 select * into strict o from public.rmc_organizations where id=new.organization_id;
 if new.node_id is distinct from o.node_id or new.data->>'scopeNodeId' is distinct from o.node_id then raise exception 'Organization events must stay within their unit.'; end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
  changed:=(new.data-array['status','approvalStatus','reviewNotes','reviewedBy','timestamp','cancellationStatus','requiresOssaApproval','reviewedAt'])
   is distinct from (old.data-array['status','approvalStatus','reviewNotes','reviewedBy','timestamp','cancellationStatus','requiresOssaApproval','reviewedAt']);
 end if;
 if changed then
  if not coalesce(app_private.organization_manager(o.id),false) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  if new.data->>'kind' not in ('attendance','merit') then raise exception 'Choose an attendance or merit event.'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.rmc_attendance where event_id=old.id) then raise exception 'Events with attendance cannot be edited.'; end if;
  if new.data->>'kind'='merit' then
   new.data:=new.data||'{"penaltyValue":0,"sanctionRules":{"late":{"value":0,"unit":"hours"},"absent":{"value":0,"unit":"hours"}}}';
  end if;
  needs_review:=greatest(coalesce((new.data->>'penaltyValue')::numeric,0),coalesce((new.data#>>'{sanctionRules,late,value}')::numeric,0),coalesce((new.data#>>'{sanctionRules,absent,value}')::numeric,0))>0;
  new.data:=(new.data-'reviewedBy'-'reviewNotes')||jsonb_build_object('approvalStatus',case when needs_review then 'pending' else 'approved' end);
 elsif new.data->>'approvalStatus' is distinct from old.data->>'approvalStatus' then
  if not (coalesce((old.data->>'requiresOssaApproval')::boolean,false) and a.role_id in ('ossa','ossa_staff') and app_private.permitted('events.approve') and app_private.in_scope(new.node_id)) and not coalesce(app_private.organization_reviewer(o.id),false) then raise exception 'OSAS approval is required.' using errcode='42501'; end if;
  if old.data->>'approvalStatus' is distinct from 'pending' or new.data->>'approvalStatus' is null or new.data->>'approvalStatus' not in ('approved','rejected') or new.start_at<=now() then
   raise exception 'Review only pending events before they start.';
  end if;
 end if;
 return new;
end $$;

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

-- Preserve completed activities and existing attendance; open SSG activities
-- without attendance enter the new review workflow.
alter table public.rmc_events disable trigger a_validate_organization_event;
update public.rmc_events e set data=(e.data-'reviewedBy'-'reviewNotes'-'reviewedAt')||'{"requiresOssaApproval":true,"approvalStatus":"pending","status":"pending"}'::jsonb
where e.created_by in (select id from public.rmc_profiles where role_id='ssg')
and e.end_at>now() and e.finalized_at is null and e.data->>'cancellationStatus' is null
and not exists(select 1 from public.rmc_attendance a where a.event_id=e.id);
alter table public.rmc_events enable trigger a_validate_organization_event;

create function app_private.enforce_activity_approval() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
 a public.rmc_profiles:=app_private.actor();
 required boolean;
 changed boolean:=true;
 ignored text[]:=array['status','approvalStatus','requiresOssaApproval','reviewedBy','reviewedAt','reviewNotes','timestamp','cancellationStatus'];
begin
 -- This is a restriction, so read the explicit role rule (not admin's permission bypass).
 required:=exists(select 1 from public.rmc_roles r where r.id=a.role_id and r.data->'permissions' ? 'events.require_ossa_approval');
 if tg_op='UPDATE' then
  required:=required or coalesce((old.data->>'requiresOssaApproval')::boolean,false);
  changed:=(new.data-ignored) is distinct from (old.data-ignored)
    or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.node_id is distinct from old.node_id;
 end if;
 new.data:=(new.data-'requiresOssaApproval')||jsonb_build_object('requiresOssaApproval',required);
 if not required then
  -- Ordinary institutional activities cannot forge review metadata.
  if new.organization_id is null then new.data:=new.data-array['approvalStatus','reviewedBy','reviewedAt','reviewNotes']; end if;
  return new;
 end if;
 if changed then
  if a.id is null then raise exception 'An authenticated author is required.' using errcode='42501'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.rmc_attendance where event_id=old.id) then
   raise exception 'Activities with attendance cannot be changed.';
  end if;
  new.data:=(new.data-array['reviewedBy','reviewedAt','reviewNotes'])||'{"approvalStatus":"pending","status":"pending"}'::jsonb;
  if new.end_at>now() and new.data->>'cancellationStatus' is null then new.finalized_at:=null; end if;
 elsif new.data->>'approvalStatus' is distinct from old.data->>'approvalStatus' then
  if a.id is null or a.role_id not in ('ossa','ossa_staff') or not app_private.permitted('events.approve') or not app_private.in_scope(new.node_id) or a.id=new.created_by then
   raise exception 'OSSA review permission is required; authors cannot review their own requests.' using errcode='42501';
  end if;
  if old.data->>'approvalStatus' is distinct from 'pending' or new.data->>'approvalStatus' is null or new.data->>'approvalStatus' not in ('approved','rejected') then
   raise exception 'Only pending requests can be approved or rejected.';
  end if;
  if new.data->>'cancellationStatus' is not null or new.finalized_at is not null or new.end_at<=now() then raise exception 'This activity is closed. Reschedule before review.'; end if;
  if new.data->>'approvalStatus'='approved' and new.start_at<=now() then raise exception 'Reschedule the activity before approving it.'; end if;
  new.data:=new.data||jsonb_build_object('reviewedBy',a.id,'reviewedAt',extract(epoch from now())*1000,'reviewNotes',left(coalesce(new.data->>'reviewNotes',''),2000),'status',case when new.data->>'approvalStatus'='approved' then 'upcoming' else 'rejected' end);
 else
  -- Status-only updates, forged reviewer fields, and turning off the role rule
  -- cannot activate an already submitted request.
  new.data:=(new.data-array['reviewedBy','reviewedAt','reviewNotes'])||(old.data-array(select jsonb_object_keys(old.data-array['reviewedBy','reviewedAt','reviewNotes'])));
  if old.data->>'approvalStatus' in ('pending','rejected') and new.data->>'cancellationStatus' is null then
   new.data:=new.data||jsonb_build_object('status',old.data->>'approvalStatus');
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.enforce_activity_approval() from public,anon,authenticated;
create trigger b_enforce_activity_approval before insert or update on public.rmc_events for each row execute function app_private.enforce_activity_approval();

create function app_private.review_event(event_id uuid, decision text, notes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); e public.rmc_events;
begin
 if a.id is null or a.role_id not in ('ossa','ossa_staff') then raise exception 'OSSA review access is required.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=event_id for update;
 perform app_private.assert_permission('events.approve',e.node_id);
 if a.id=e.created_by then raise exception 'Authors cannot review their own requests.' using errcode='42501'; end if;
 if not coalesce((e.data->>'requiresOssaApproval')::boolean,false) or e.data->>'approvalStatus' is distinct from 'pending' then raise exception 'This request is no longer pending.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 if decision='rejected' and length(trim(coalesce(notes,'')))=0 then raise exception 'Explain why this request was rejected.'; end if;
 update public.rmc_events set data=data||jsonb_build_object('approvalStatus',decision,'reviewNotes',left(coalesce(notes,''),2000)) where id=event_id returning * into e;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'reviewEvent',event_id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',e.data->>'title','decision',decision,'notes',left(coalesce(notes,''),2000)));
 return e.data;
end $$;
create function public.rmc_review_event(event_id uuid,decision text,notes text default '') returns jsonb
language sql security invoker set search_path='' as $$ select app_private.review_event(event_id,decision,notes) $$;
revoke all on function app_private.review_event(uuid,text,text),public.rmc_review_event(uuid,text,text) from public,anon,authenticated;
grant execute on function app_private.review_event(uuid,text,text),public.rmc_review_event(uuid,text,text) to authenticated;

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
      or (g='All Mayors' and person->>'role'='mayor') or g='person:'||(person->>'uid')
      or (left(g,5)='node:' and substring(g from 6)=any(ids)) then return true; end if;
   if exists(select 1 from public.rmc_nodes where id=any(ids) and data->>'name'=case g when 'JHS' then 'Junior High School' when 'SHS' then 'Senior High School' else g end) then return true; end if;
  end loop;
  return false;
 end if;
 return coalesce(audience->>'mode'='all' or ev#>>'{target,all}'='true' or ev->>'participantsType'='all'
  or ev->'specificParticipants' ? (person->>'uid'),false);
end $$;

create or replace function app_private.can_read_event(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_events e, app_private.actor() a where e.id=target and (
   (a.role_id in ('ossa','ossa_staff') and app_private.permitted('events.approve') and app_private.in_scope(e.node_id)) or
 case when e.organization_id is not null then
  app_private.organization_manager(e.organization_id) or app_private.recipient(e.data,a.profile)
  or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and app_private.in_scope(e.node_id) and e.data->>'approvalStatus'='approved')
 else
  app_private.recipient(e.data,a.profile) or app_private.ceremony_volunteer(e.data,a.profile)
  or (app_private.permitted('events.manage') and (e.created_by=a.id or app_private.in_scope(e.node_id)))
  or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and exists
   (select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and (app_private.recipient(e.data,p.profile) or app_private.ceremony_volunteer(e.data,p.profile))))
 end))
$$;

create or replace function public.rmc_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'organizations',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
  'can_manage',app_private.organization_manager(o.id),'can_review',app_private.organization_reviewer(o.id),
  'can_assign_heads',(select role_id from app_private.actor())='admin' or (o.node_id is not null and app_private.permitted('directory.manage_structure') and app_private.in_scope(o.node_id)))) from public.rmc_organizations o),'[]'),
 'organization_members',coalesce((select jsonb_agg(to_jsonb(m)) from public.rmc_organization_members m),'[]'),
 'organization_sanctions',coalesce((select jsonb_agg(to_jsonb(s)) from public.rmc_organization_sanctions s),'[]'),
 'profiles',coalesce((select jsonb_agg(profile||jsonb_build_object('uid',id,'role',role_id,'account_status',status)) from public.rmc_profiles),'[]'),
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'data',data)) from public.rmc_nodes),'[]'),
 'roles',coalesce((select jsonb_object_agg(id,data) from public.rmc_roles),'{}'),
 'applications',coalesce((select jsonb_agg(data) from public.rmc_applications),'[]'),
 'events',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'status',case when data->>'approvalStatus' in ('pending','rejected') and data->>'cancellationStatus' is null then data->>'approvalStatus' when data->>'status'='done' or end_at<now() then 'done' when start_at<=now() then 'active' else 'upcoming' end)) from public.rmc_events),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('event_id',event_id,'student_id',student_id,'slot',slot,'data',data)) from public.rmc_attendance),'[]'),
 'merit_credits',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'event_id',event_id,'hours',hours)) from public.rmc_merit_credits),'[]'),
 'sanctions',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'data',data||jsonb_build_object('id',id))) from public.rmc_sanctions),'[]'),
 'excuses',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'event_id',event_id)) from public.rmc_excuses),'[]'),
 'settings',coalesce((select jsonb_object_agg(id,data) from public.rmc_settings),'{}'),
 'audit',coalesce((select jsonb_agg(row_data) from (select data||jsonb_build_object('id',id,'action',action,'actor_uid',actor_id,'target_uid',target,'timestamp',extract(epoch from created_at)*1000) row_data from public.rmc_audit order by created_at desc limit 500) logs),'[]')
 )
$$;

-- Non-recipients may attend; the merit setting controls the reward only.
create or replace function app_private.ceremony_volunteer(ev jsonb, person jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(coalesce(ev->>'approvalStatus','approved') not in ('pending','rejected') and ev->>'kind'='flag_ceremony'
 and person->>'role' in ('student','mayor','ssg')
 and not coalesce(ev#>'{ceremony,exemptStudentIds}' ? (person->>'uid'),false)
 and (ev->>'scopeNodeId' is null or ev->>'scopeNodeId'=any(app_private.path(coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}')))),false)
$$;
