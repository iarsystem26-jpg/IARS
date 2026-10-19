-- Organizations are extracurricular memberships, independent of academic enrollment.
create table public.rmc_organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=4000),
 logo_url text not null default '',
 node_id text references public.rmc_nodes(id) on delete restrict,
 visible boolean not null default true,
 joining text not null default 'closed' check(joining in ('closed','open','approval')),
 key_required boolean not null default false,
 head_ids uuid[] not null default '{}',
 created_at timestamptz not null default now()
);
create index rmc_organizations_node_idx on public.rmc_organizations(node_id);
create index rmc_organizations_heads_idx on public.rmc_organizations using gin(head_ids);
create table app_private.organization_keys (
 organization_id uuid primary key references public.rmc_organizations(id) on delete cascade,
 key_hash text not null
);
create table public.rmc_organization_members (
 organization_id uuid not null references public.rmc_organizations(id) on delete cascade,
 student_id uuid not null references public.rmc_profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 primary key(organization_id,student_id)
);
create index rmc_organization_members_student_idx on public.rmc_organization_members(student_id);
create table public.rmc_organization_sanctions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.rmc_organizations(id) on delete restrict,
 student_id uuid not null references public.rmc_profiles(id) on delete restrict,
 hours numeric(12,6) not null check(hours>0 and hours<=1000),
 reason text not null check(length(trim(reason)) between 5 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_by uuid references public.rmc_profiles(id) on delete set null,
 reviewed_by uuid references public.rmc_profiles(id) on delete set null,
 review_notes text not null default '',
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index rmc_organization_sanctions_org_idx on public.rmc_organization_sanctions(organization_id);
create index rmc_organization_sanctions_student_idx on public.rmc_organization_sanctions(student_id);
create index rmc_organization_sanctions_requester_idx on public.rmc_organization_sanctions(requested_by);
create index rmc_organization_sanctions_reviewer_idx on public.rmc_organization_sanctions(reviewed_by);
alter table public.rmc_events add column organization_id uuid references public.rmc_organizations(id) on delete restrict;
create index rmc_events_organization_idx on public.rmc_events(organization_id);

create function app_private.organization_reviewer(org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_organizations o, app_private.actor() a where o.id=org
 and a.role_id in ('ossa','ossa_staff') and app_private.permitted('ossa.manage_cases')
 and (o.node_id is null or app_private.in_scope(o.node_id)))
$$;
create function app_private.organization_manager(org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_organizations o, app_private.actor() a where o.id=org
 and (a.role_id='admin' or a.id=any(o.head_ids) or app_private.organization_reviewer(org)))
$$;
create function app_private.organization_member(org uuid, student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_organization_members m join public.rmc_profiles p on p.id=m.student_id
 join public.rmc_organizations o on o.id=m.organization_id where m.organization_id=org and m.student_id=student
 and m.status='approved' and p.status='active' and (o.node_id is null or o.node_id=any(app_private.path(p.node_id))))
$$;
create function app_private.organization_visible(org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.session_allowed() and exists(select 1 from public.rmc_organizations o where o.id=org
 and (o.visible or app_private.organization_manager(org)
 or exists(select 1 from public.rmc_organization_members m where m.organization_id=org and m.student_id=auth.uid())))
$$;

alter table public.rmc_organizations enable row level security;
alter table public.rmc_organization_members enable row level security;
alter table public.rmc_organization_sanctions enable row level security;
alter table app_private.organization_keys enable row level security;
revoke all on public.rmc_organizations,public.rmc_organization_members,public.rmc_organization_sanctions,app_private.organization_keys from public,anon,authenticated;
grant select on public.rmc_organizations,public.rmc_organization_members,public.rmc_organization_sanctions to authenticated;
grant all on public.rmc_organizations,public.rmc_organization_members,public.rmc_organization_sanctions,app_private.organization_keys to service_role;
create policy organization_read on public.rmc_organizations for select to authenticated using(app_private.organization_visible(id));
create policy organization_members_read on public.rmc_organization_members for select to authenticated using(
 app_private.session_allowed() and (student_id=(select auth.uid()) or app_private.organization_manager(organization_id)));
create policy organization_sanctions_read on public.rmc_organization_sanctions for select to authenticated using(
 app_private.session_allowed() and (student_id=(select auth.uid()) or app_private.organization_manager(organization_id)));
create policy organization_keys_private on app_private.organization_keys for all to anon,authenticated using(false) with check(false);

-- Public discovery returns only opted-in organization information, never rosters or keys.
create function app_private.public_organizations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'logo_url',logo_url,
 'node_id',node_id,'visible',visible,'joining',joining,'key_required',key_required) order by name),'[]')
 from public.rmc_organizations where visible
$$;
create function public.rmc_public_organizations() returns jsonb language sql stable security invoker set search_path='' as $$
 select app_private.public_organizations()
$$;

-- Only the limited identity fields needed to select members/heads are returned.
create function app_private.organization_people(org uuid, scope_node text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); o public.rmc_organizations;
begin
 if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
 if org is not null then
  select * into strict o from public.rmc_organizations where id=org;
  if not app_private.organization_manager(org) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  scope_node:=o.node_id;
 else
  perform app_private.assert_permission('directory.manage_structure',scope_node);
  if a.role_id<>'admin' and scope_node is null then raise exception 'Select your assigned unit.'; end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('uid',p.id,'name',p.profile->>'name','student_id',p.profile->>'student_id','role',p.role_id,
 'can_add',a.role_id='admin' or app_private.in_scope(p.node_id)) order by p.profile->>'name')
 from public.rmc_profiles p where p.status='active'
 and (scope_node is null or scope_node=any(app_private.path(p.node_id)))
 and (org is not null or a.role_id='admin' or app_private.in_scope(p.node_id))),'[]');
end $$;
create function public.rmc_organization_people(org uuid default null, scope_node text default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select app_private.organization_people(org,scope_node) $$;

create function app_private.organization_command(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); o public.rmc_organizations; p public.rmc_profiles;
 org uuid:=nullif(payload->>'organizationId','')::uuid; target uuid; h uuid; key_value text:=payload->>'key';
 request public.rmc_organization_sanctions; e public.rmc_events; d jsonb; result jsonb:='true'; state text; hours numeric;
begin
 if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
 if action='create' then
  perform app_private.assert_permission('directory.manage_structure',nullif(payload->>'node_id',''));
  if a.role_id<>'admin' and nullif(payload->>'node_id','') is null then raise exception 'Select your assigned unit.'; end if;
  org:=gen_random_uuid();
  insert into public.rmc_organizations(id,name,node_id) values(org,trim(payload->>'name'),nullif(payload->>'node_id',''));
 end if;
 select * into strict o from public.rmc_organizations where id=org for update;
 if a.role_id<>'admin' and (app_private.frozen(a.node_id) or app_private.frozen(o.node_id)) then raise exception 'Operations are frozen for this school or unit.'; end if;
 if action in ('create','update') then
  if action='update' and not app_private.organization_manager(org) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  if action='create' or (payload ? 'node_id' and nullif(payload->>'node_id','') is distinct from o.node_id) or
    (payload ? 'head_ids' and payload->'head_ids' is distinct from to_jsonb(o.head_ids)) then
   perform app_private.assert_permission('directory.manage_structure',o.node_id);
   if o.node_id is null and a.role_id<>'admin' then raise exception 'Only an administrator can assign school-wide organization heads.'; end if;
   if action<>'create' and nullif(payload->>'node_id','') is distinct from o.node_id then raise exception 'The organization unit cannot be moved. Create a new organization for another unit.'; end if;
   for h in select value::uuid from jsonb_array_elements_text(coalesce(payload->'head_ids','[]')) loop
    if not exists(select 1 from public.rmc_profiles where id=h and status='active' and
     (o.node_id is null or o.node_id=any(app_private.path(node_id)))) then raise exception 'Heads must be active accounts within the organization unit.'; end if;
   end loop;
  end if;
  if coalesce(payload->>'logo_url',o.logo_url)<>'' and coalesce(payload->>'logo_url',o.logo_url) !~ '^https://lh3\.googleusercontent\.com/d/[A-Za-z0-9_-]+=w4000$' then
   raise exception 'Upload the organization logo through the image service.';
  end if;
  if key_value is not null and key_value<>'' then
   if length(key_value)<6 or length(key_value)>128 then raise exception 'Join keys must contain 6 to 128 characters.'; end if;
   insert into app_private.organization_keys values(org,extensions.crypt(key_value,extensions.gen_salt('bf')))
   on conflict(organization_id) do update set key_hash=excluded.key_hash;
  end if;
  if coalesce((payload->>'key_required')::boolean,o.key_required) and not exists(select 1 from app_private.organization_keys where organization_id=org) then
   raise exception 'Set a join key before requiring it.';
  end if;
  update public.rmc_organizations set name=coalesce(trim(payload->>'name'),name),description=coalesce(payload->>'description',description),
   logo_url=coalesce(payload->>'logo_url',logo_url),visible=coalesce((payload->>'visible')::boolean,visible),
   joining=coalesce(payload->>'joining',joining),key_required=coalesce((payload->>'key_required')::boolean,key_required),
   head_ids=case when payload ? 'head_ids' then array(select value::uuid from jsonb_array_elements_text(payload->'head_ids')) else head_ids end where id=org;
  result:=to_jsonb(org);
 elsif action in ('join','addMember','reviewMember','removeMember','leave') then
  target:=case when action in ('join','leave') then a.id else (payload->>'studentId')::uuid end;
  select * into strict p from public.rmc_profiles where id=target;
  if action not in ('join','leave') and not app_private.organization_manager(org) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  if action in ('leave','removeMember') then
   delete from public.rmc_organization_members where organization_id=org and student_id=target;
  else
   if p.status<>'active' or p.role_id not in ('student','mayor','ssg') or
    (o.node_id is not null and not o.node_id=any(app_private.path(p.node_id))) then raise exception 'Select an active student within the organization unit.'; end if;
   if action='addMember' and not app_private.in_scope(p.node_id) then raise exception 'Add students only from your own assigned unit.' using errcode='42501'; end if;
   if action='join' then
    if not o.visible or o.joining='closed' then raise exception 'This organization is not open for self joining.'; end if;
    if o.key_required and not exists(select 1 from app_private.organization_keys where organization_id=org
     and key_hash=extensions.crypt(coalesce(key_value,''),key_hash)) then raise exception 'The organization join key is incorrect.'; end if;
    state:=case when o.joining='approval' then 'pending' else 'approved' end;
    if exists(select 1 from public.rmc_organization_members where organization_id=org and student_id=target and status in ('pending','approved')) then
     raise exception 'You have already joined or submitted an application.';
    end if;
   elsif action='reviewMember' then
    state:=payload->>'status';
    if state is null or state not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
    if not exists(select 1 from public.rmc_organization_members where organization_id=org and student_id=target and status='pending') then raise exception 'This application is no longer pending.'; end if;
   else state:='approved'; end if;
   insert into public.rmc_organization_members(organization_id,student_id,status,reviewed_at) values(org,target,state,case when state<>'pending' then now() end)
   on conflict(organization_id,student_id) do update set status=excluded.status,reviewed_at=excluded.reviewed_at,created_at=case when action='join' then now() else rmc_organization_members.created_at end;
  end if;
 elsif action='requestSanction' then
  if not app_private.organization_manager(org) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  target:=(payload->>'studentId')::uuid;
  if not app_private.organization_member(org,target) then raise exception 'Sanctions can only be requested for current organization members.'; end if;
  insert into public.rmc_organization_sanctions(organization_id,student_id,hours,reason,requested_by)
   values(org,target,(payload->>'hours')::numeric,trim(payload->>'reason'),a.id) returning to_jsonb(id) into result;
 elsif action='reviewSanction' then
  if not app_private.organization_reviewer(org) then raise exception 'OSAS approval is required.' using errcode='42501'; end if;
  select * into strict request from public.rmc_organization_sanctions where id=(payload->>'requestId')::uuid and organization_id=org for update;
  if request.status<>'pending' then raise exception 'This sanction has already been reviewed.'; end if;
  state:=payload->>'status';
  if state is null or state not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
  if state='approved' then
   if not app_private.organization_member(org,request.student_id) then raise exception 'The student is no longer an eligible member.'; end if;
   perform app_private.sanction(request.student_id,request.hours,o.name||': '||request.reason,null,'organization:'||request.id::text);
  end if;
  update public.rmc_organization_sanctions set status=state,reviewed_by=a.id,reviewed_at=now(),review_notes=left(coalesce(payload->>'notes',''),2000) where id=request.id;
 elsif action in ('saveEvent','cancelEvent','reviewEvent') then
  if not app_private.organization_manager(org) then raise exception 'Organization management access is required.' using errcode='42501'; end if;
  target:=nullif(payload->>'eventId','')::uuid;
  if target is not null then
   select * into strict e from public.rmc_events where id=target and organization_id=org for update;
  end if;
  if action='reviewEvent' then
   if not app_private.organization_reviewer(org) then raise exception 'OSAS approval is required.' using errcode='42501'; end if;
   if e.id is null or e.data->>'approvalStatus'<>'pending' then raise exception 'This event is no longer pending.'; end if;
   if e.start_at<=now() then raise exception 'Reschedule the event before approving it.'; end if;
   state:=payload->>'status';
   if state is null or state not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
   update public.rmc_events set data=data||jsonb_build_object('approvalStatus',state,'reviewedBy',a.id,'reviewNotes',left(coalesce(payload->>'notes',''),2000)) where id=e.id;
  elsif action='cancelEvent' then
   if e.id is null then raise exception 'Event not found.'; end if;
   update public.rmc_events set data=data||'{"status":"done","cancellationStatus":"cancelled"}',finalized_at=now() where id=e.id;
  else
   d:=payload->'event';
   if e.id is not null and (e.start_at<=now() or exists(select 1 from public.rmc_attendance where event_id=e.id)) then raise exception 'Only future events without attendance can be edited.'; end if;
   if to_timestamp((d->>'startTime')::numeric/1000)<=now() then raise exception 'Choose a future event schedule.'; end if;
   if d->>'kind' is null or d->>'kind' not in ('attendance','merit') then raise exception 'Choose an attendance or merit event.'; end if;
   target:=coalesce(target,gen_random_uuid());
   d:=(d-'recurrence'-'seriesId'-'reviewedBy'-'reviewNotes'-'cancellationStatus')||jsonb_build_object('id',target,'organizationId',org,
    'scopeNodeId',o.node_id,'created_by',coalesce(e.created_by,a.id),'status','upcoming','timestamp',extract(epoch from now())*1000,
    'audienceTarget',jsonb_build_object('mode','all'),'recipientGroups',jsonb_build_array(o.name||' members'),'target',jsonb_build_object('all',true));
   if e.id is null then
    insert into public.rmc_events(id,data,created_by,node_id,start_at,end_at,organization_id)
     values(target,d,a.id,o.node_id,to_timestamp((d->>'startTime')::numeric/1000),to_timestamp((d->>'endTime')::numeric/1000),org);
   else update public.rmc_events set data=d,start_at=to_timestamp((d->>'startTime')::numeric/1000),end_at=to_timestamp((d->>'endTime')::numeric/1000) where id=target; end if;
   result:=to_jsonb(target);
  end if;
 else raise exception 'Unsupported organization operation.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'organization.'||action,org::text,
  jsonb_build_object('actor_name',a.profile->>'name','target_name',o.name,'student_id',case when action in ('join','leave','addMember','reviewMember','removeMember','requestSanction') then target end));
 return result;
end $$;
create function public.rmc_organization_command(action text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.organization_command(action,payload) $$;

-- Protect all write paths, including the older generic event command.
create function app_private.validate_organization_event() returns trigger
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
  changed:=(new.data-array['status','approvalStatus','reviewNotes','reviewedBy','timestamp','cancellationStatus'])
   is distinct from (old.data-array['status','approvalStatus','reviewNotes','reviewedBy','timestamp','cancellationStatus']);
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
  if not coalesce(app_private.organization_reviewer(o.id),false) then raise exception 'OSAS approval is required.' using errcode='42501'; end if;
  if old.data->>'approvalStatus' is distinct from 'pending' or new.data->>'approvalStatus' is null or new.data->>'approvalStatus' not in ('approved','rejected') or new.start_at<=now() then
   raise exception 'Review only pending events before they start.';
  end if;
 end if;
 return new;
end $$;
-- Run before the existing scope validation (triggers run alphabetically).
create trigger a_validate_organization_event before insert or update on public.rmc_events for each row execute function app_private.validate_organization_event();

revoke all on function app_private.organization_reviewer(uuid),app_private.organization_manager(uuid),app_private.organization_member(uuid,uuid),app_private.organization_visible(uuid),app_private.organization_people(uuid,text),app_private.organization_command(text,jsonb),app_private.public_organizations(),app_private.validate_organization_event() from public,anon,authenticated;
grant execute on function app_private.organization_reviewer(uuid),app_private.organization_manager(uuid),app_private.organization_member(uuid,uuid),app_private.organization_visible(uuid),app_private.organization_people(uuid,text),app_private.organization_command(text,jsonb) to authenticated;
grant execute on function app_private.public_organizations() to anon,authenticated;
revoke all on function public.rmc_organization_command(text,jsonb),public.rmc_organization_people(uuid,text),public.rmc_public_organizations() from public,anon,authenticated;
grant execute on function public.rmc_organization_command(text,jsonb),public.rmc_organization_people(uuid,text) to authenticated;
grant execute on function public.rmc_public_organizations() to anon,authenticated;

create or replace function app_private.recipient(ev jsonb, person jsonb) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ids text[]; audience jsonb := ev->'audienceTarget'; g text; section text := person#>>'{school_data,academic_assignment,terminalGroupId}';
begin
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

create or replace function app_private.enforce_event_recipient_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 a public.rmc_profiles := app_private.actor();
 audience jsonb := new.data->'audienceTarget';
 recipient text;
begin
 if new.organization_id is not null then return new; end if;
 -- Scheduled maintenance has no actor; its updates do not select recipients.
 if a.id is null or a.role_id='admin' then return new; end if;
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
end $$;

create or replace function app_private.can_read_event(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_events e, app_private.actor() a where e.id=target and
 case when e.organization_id is not null then
  app_private.organization_manager(e.organization_id) or app_private.recipient(e.data,a.profile)
  or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and app_private.in_scope(e.node_id) and e.data->>'approvalStatus'='approved')
 else
  app_private.recipient(e.data,a.profile) or app_private.ceremony_volunteer(e.data,a.profile)
  or (app_private.permitted('events.manage') and (e.created_by=a.id or app_private.in_scope(e.node_id)))
  or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and exists
   (select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and (app_private.recipient(e.data,p.profile) or app_private.ceremony_volunteer(e.data,p.profile))))
 end)
$$;

create or replace function app_private.record_attendance(event_id uuid,student_id uuid,direction text,qr_token text,scan_position jsonb,manual_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
begin
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 if e.organization_id is not null and app_private.organization_manager(e.organization_id) then
  if a.id is null or app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is unavailable for this account or unit.'; end if;
 else
  perform app_private.assert_permission('attendance.scan',p.node_id);
 end if;
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
 'organizations',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
  'can_manage',app_private.organization_manager(o.id),'can_review',app_private.organization_reviewer(o.id),
  'can_assign_heads',(select role_id from app_private.actor())='admin' or (o.node_id is not null and app_private.permitted('directory.manage_structure') and app_private.in_scope(o.node_id)))) from public.rmc_organizations o),'[]'),
 'organization_members',coalesce((select jsonb_agg(to_jsonb(m)) from public.rmc_organization_members m),'[]'),
 'organization_sanctions',coalesce((select jsonb_agg(to_jsonb(s)) from public.rmc_organization_sanctions s),'[]'),
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
