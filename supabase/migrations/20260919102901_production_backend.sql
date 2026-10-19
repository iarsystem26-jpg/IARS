-- RMC: canonical records, server-authoritative writes, and scoped read policies.
create schema if not exists app_private;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

create table public.rmc_roles (
  id text primary key, data jsonb not null,
  check (jsonb_typeof(data->'permissions') = 'array')
);
create table public.rmc_nodes (
  id text primary key, parent_id text references public.rmc_nodes(id) on delete restrict,
  data jsonb not null, enrollment_key_hash text,
  check (length(data->>'name') between 1 and 200), check (id <> parent_id)
);
create index rmc_nodes_parent_idx on public.rmc_nodes(parent_id);
create table public.rmc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null, created_at timestamptz not null default now(),
  role_id text not null default 'student' references public.rmc_roles(id),
  status text not null default 'pending' check (status in ('pending','active','suspended','inactive','graduated')),
  node_id text references public.rmc_nodes(id) on delete restrict,
  is_test_account boolean not null default false,
  check (length(trim(profile->>'name')) between 1 and 200),
  check (length(trim(profile->>'username')) between 1 and 100),
  check (length(trim(profile->>'student_id')) between 1 and 100)
);
create unique index rmc_profile_username_idx on public.rmc_profiles(lower(profile->>'username'));
create unique index rmc_profile_student_id_idx on public.rmc_profiles(lower(profile->>'student_id'));
create unique index rmc_profile_email_idx on public.rmc_profiles(lower(profile->>'email'));
create index rmc_profiles_node_idx on public.rmc_profiles(node_id);
create index rmc_profiles_role_idx on public.rmc_profiles(role_id);
create table public.rmc_applications (
  id uuid primary key references public.rmc_profiles(id) on delete cascade,
  data jsonb not null
);
create table public.rmc_events (
  id uuid primary key default gen_random_uuid(), data jsonb not null,
  created_by uuid not null references public.rmc_profiles(id) on delete restrict,
  node_id text references public.rmc_nodes(id) on delete restrict,
  start_at timestamptz not null, end_at timestamptz not null,
  finalized_at timestamptz, check (end_at > start_at)
);
create index rmc_events_creator_idx on public.rmc_events(created_by);
create index rmc_events_node_idx on public.rmc_events(node_id);
create index rmc_events_end_idx on public.rmc_events(end_at) where finalized_at is null;
create table public.rmc_attendance (
  event_id uuid not null references public.rmc_events(id) on delete restrict,
  student_id uuid not null references public.rmc_profiles(id) on delete restrict,
  slot text not null default 'default', data jsonb not null,
  primary key (event_id, student_id, slot)
);
create index rmc_attendance_student_idx on public.rmc_attendance(student_id);
create table public.rmc_sanctions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.rmc_profiles(id) on delete restrict,
  event_id uuid references public.rmc_events(id) on delete restrict,
  source text unique, data jsonb not null
);
create index rmc_sanctions_student_idx on public.rmc_sanctions(student_id);
create index rmc_sanctions_event_idx on public.rmc_sanctions(event_id);
create table public.rmc_excuses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.rmc_profiles(id) on delete restrict,
  event_id uuid not null references public.rmc_events(id) on delete restrict,
  data jsonb not null
);
create index rmc_excuses_student_idx on public.rmc_excuses(student_id);
create index rmc_excuses_event_idx on public.rmc_excuses(event_id);
create unique index rmc_excuses_pending_idx on public.rmc_excuses(student_id,event_id) where data->>'status' in ('pending','approved');
create table public.rmc_settings (id text primary key, data jsonb not null);
create table public.rmc_audit (
  id bigint generated always as identity primary key, actor_id uuid,
  action text not null, target text, created_at timestamptz not null default now(), data jsonb not null default '{}'
);
create index rmc_audit_created_idx on public.rmc_audit(created_at desc);
create table app_private.qr_tokens (
  token_hash text primary key, student_id uuid not null references public.rmc_profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index qr_tokens_student_idx on app_private.qr_tokens(student_id);
create index qr_tokens_expiry_idx on app_private.qr_tokens(expires_at);
alter table app_private.qr_tokens enable row level security;

insert into public.rmc_settings values
 ('system_freeze','{"isFrozen":false,"reason":""}'), ('frozen_nodes','{}'),
 ('payment_info','{"status":"unpaid","amountDue":0,"currency":"PHP","dueDate":0,"billingCycle":"","accountName":"","schoolId":"","reminders":[]}');

create function app_private.actor() returns public.rmc_profiles language sql stable security definer set search_path = '' as $$
 select p from public.rmc_profiles p where p.id = (select auth.uid()) and p.status='active'
$$;
create function app_private.permitted(permission text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(exists(select 1 from public.rmc_profiles p join public.rmc_roles r on r.id=p.role_id
   where p.id=(select auth.uid()) and p.status='active' and not coalesce((r.data->>'isPositionOnly')::boolean,false)
   and (p.role_id='admin' or r.data->'permissions' ? permission)),false)
$$;
create function app_private.path(node text) returns text[] language sql stable security definer set search_path = '' as $$
 with recursive ancestors as (
   select id,parent_id, array[id] as visited from public.rmc_nodes where id=node
   union all select n.id,n.parent_id,a.visited||n.id from public.rmc_nodes n join ancestors a on n.id=a.parent_id where not n.id=any(a.visited)
 ) select coalesce(array_agg(id),'{}') from ancestors
$$;
create function app_private.in_scope(node text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(a.role_id='admin' or a.node_id=any(app_private.path(node)),false) from app_private.actor() a
$$;
create function app_private.can_read_profile(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid())=target or exists(select 1 from public.rmc_profiles p where p.id=target
   and app_private.in_scope(p.node_id) and (
     app_private.permitted('directory.manage_members') or app_private.permitted('attendance.scan')
     or app_private.permitted('attendance.manage') or app_private.permitted('ossa.manage_cases')
     or app_private.permitted('system.manage_accounts') or app_private.permitted('system.manage_rbac')))
$$;
create function app_private.frozen(node text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((select (data->>'isFrozen')::boolean from public.rmc_settings where id='system_freeze'),false)
 or exists(select 1 from public.rmc_settings s, unnest(app_private.path(node)) n where s.id='frozen_nodes' and (s.data->n->>'isFrozen')::boolean)
$$;
create function app_private.recipient(ev jsonb, person jsonb) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ids text[]; audience jsonb := ev->'audienceTarget'; g text; section text := person#>>'{school_data,academic_assignment,terminalGroupId}';
begin
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

create function app_private.write_node(parent text, node jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare child jsonb; node_id text:=coalesce(nullif(node->>'id',''),gen_random_uuid()::text);
begin
 if node->>'name' is null or node->>'type' is null then raise exception 'Unit name and type are required.'; end if;
 insert into public.rmc_nodes(id,parent_id,data) values(node_id,parent,(node-'children')||jsonb_build_object('id',node_id));
 for child in select jsonb_array_elements(coalesce(node->'children','[]')) loop perform app_private.write_node(node_id,child); end loop;
end $$;
create function app_private.can_read_event(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.rmc_events e, app_private.actor() a where e.id=target and
   (app_private.recipient(e.data,a.profile) or (app_private.permitted('events.manage') and (e.created_by=a.id or app_private.in_scope(e.node_id)))
    or ((app_private.permitted('attendance.scan') or app_private.permitted('attendance.manage')) and exists
      (select 1 from public.rmc_profiles p where app_private.in_scope(p.node_id) and app_private.recipient(e.data,p.profile)))))
$$;

do $$ declare t text; begin
 foreach t in array array['rmc_roles','rmc_nodes','rmc_profiles','rmc_applications','rmc_events','rmc_attendance','rmc_sanctions','rmc_excuses','rmc_settings','rmc_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke select on public.rmc_nodes from authenticated;
grant select(id,parent_id,data) on public.rmc_nodes to anon, authenticated;
create policy directory_read on public.rmc_nodes for select to anon, authenticated using (true);
create policy role_read on public.rmc_roles for select to authenticated using ((select auth.uid()) is not null);
create policy profile_read on public.rmc_profiles for select to authenticated using (app_private.can_read_profile(id));
create policy admission_read on public.rmc_applications for select to authenticated using (id=(select auth.uid()) or (app_private.permitted('directory.manage_members') and app_private.can_read_profile(id)));
create policy event_read on public.rmc_events for select to authenticated using (app_private.can_read_event(id));
create policy attendance_read on public.rmc_attendance for select to authenticated using (app_private.can_read_profile(student_id));
create policy sanction_read on public.rmc_sanctions for select to authenticated using (student_id=(select auth.uid()) or ((app_private.permitted('ossa.manage_cases') or app_private.permitted('attendance.manage')) and app_private.can_read_profile(student_id)));
create policy excuse_read on public.rmc_excuses for select to authenticated using (student_id=(select auth.uid()) or (app_private.permitted('ossa.manage_cases') and app_private.can_read_profile(student_id)));
create policy setting_read on public.rmc_settings for select to authenticated using (id in ('system_freeze','frozen_nodes') or app_private.permitted('system.payment_reminders') or (select role_id from app_private.actor()) in ('ossa','ossa_staff'));
create policy audit_read on public.rmc_audit for select to authenticated using (app_private.permitted('system.view_audit'));

-- Build canonical assignments from database nodes rather than trusting user-supplied paths.
create function app_private.assign_profile(person jsonb, node text, officer boolean default false) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ids text[]:=app_private.path(node); names jsonb; school jsonb; kind text;
begin
 if array_length(ids,1) is null then raise exception 'Select a valid academic unit.'; end if;
 if exists(select 1 from public.rmc_nodes where id=any(ids) and data#>>'{metadata,archived}'='true') then raise exception 'This academic unit is archived.'; end if;
 select data->>'type' into kind from public.rmc_nodes where id=node;
 if not officer and kind not in ('section','block') then raise exception 'Select a section or block.'; end if;
 select jsonb_object_agg(data->>'type',data->>'name') into names from public.rmc_nodes where id=any(ids);
 school:=coalesce(person->'school_data','{}') || jsonb_build_object('section',coalesce(names->>'section',names->>'block',''),
 'department',coalesce(names->>'department',names->>'college',names->>'education_unit',''),
 'level',coalesce(names->>'grade_level',names->>'year_level',''), 'school_id',ids[array_length(ids,1)],
 'academic_assignment',jsonb_build_object('campusId',ids[array_length(ids,1)],'terminalGroupId',node,'nodePathIds',to_jsonb(ids)));
 -- JSON path order is stored root to leaf for the directory picker.
 school:=jsonb_set(school,'{academic_assignment,nodePathIds}',(select jsonb_agg(x order by ord desc) from unnest(ids) with ordinality v(x,ord)));
 person:=jsonb_set(person,'{school_data}',school);
 if officer then person:=jsonb_set(person,'{official_data}',coalesce(person->'official_data','{}')||jsonb_build_object('assignment_node_id',node,'assignment_node_path_ids',school#>'{academic_assignment,nodePathIds}')); end if;
 return person;
end $$;

create function app_private.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb := new.raw_user_meta_data->'profile'; n text; secret text; provisioned boolean;
begin
 provisioned:=coalesce((new.raw_app_meta_data->>'rmc_provisioned')::boolean,false);
 if p is null then raise exception 'Complete the admission form to create an account.'; end if;
 p:=jsonb_build_object('uid',new.id,'name',trim(p->>'name'),'username',lower(trim(p->>'username')),
 'email',lower(new.email),'student_id',trim(p->>'student_id'),'role','student','account_status','pending',
 'photo_url','','phone',p->>'phone','guardian',p->'guardian','school_data',coalesce(p->'school_data','{}'));
 if coalesce(p->>'name','')='' or coalesce(p->>'username','') !~ '^[a-z0-9_.-]{3,100}$' or coalesce(p->>'student_id','')='' then raise exception 'Name, student ID, and a valid username are required.'; end if;
 n:=p#>>'{school_data,academic_assignment,terminalGroupId}';
 if not provisioned then
  p:=app_private.assign_profile(p,n);
  if app_private.frozen(n) then raise exception 'Enrollment is frozen for this unit.'; end if;
  select enrollment_key_hash into secret from public.rmc_nodes where id=n;
  if secret is not null and extensions.crypt(upper(trim(coalesce(new.raw_user_meta_data->>'enrollment_key',''))),secret) <> secret then raise exception 'Invalid section enrollment key.'; end if;
 end if;
 insert into public.rmc_profiles(id,profile,node_id) values(new.id,p,n);
 insert into public.rmc_applications(id,data) values(new.id,jsonb_build_object('id',new.id,'status','pending','submission_date',extract(epoch from now())*1000,'rejection_count',0,'form_data',p));
 return new;
end $$;
create trigger rmc_signup after insert on auth.users for each row execute function app_private.on_signup();

create function app_private.balance(student uuid) returns numeric language sql stable security definer set search_path = '' as $$
 select greatest(0,coalesce(sum((data->>'change')::numeric),0)) from public.rmc_sanctions where student_id=student
$$;
create function app_private.sanction(student uuid, delta numeric, reason text, event uuid default null, source_key text default null) returns void language plpgsql security definer set search_path = '' as $$
declare current_hours numeric; actual numeric;
begin
 perform 1 from public.rmc_profiles where id=student for update;
 if source_key is not null and exists(select 1 from public.rmc_sanctions where source=source_key) then return; end if;
 current_hours:=app_private.balance(student); actual:=greatest(-current_hours,delta);
 insert into public.rmc_sanctions(student_id,event_id,source,data) values(student,event,source_key,jsonb_build_object('timestamp',extract(epoch from now())*1000,'change',actual,'new_total',current_hours+actual,'reason',reason,'performed_by',coalesce((select profile->>'name' from app_private.actor()),'System'),'event_id',event));
end $$;

-- All direct client writes are denied. Commands below validate auth, permission,
-- assigned scope, account state, and freeze state in the same transaction.
create function app_private.assert_permission(permission text, node text default null, allow_frozen boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare a public.rmc_profiles:=app_private.actor();
begin
 if a.id is null or not app_private.permitted(permission) then raise exception 'Permission required: %',permission using errcode='42501'; end if;
 if node is not null and not app_private.in_scope(node) then raise exception 'This record is outside your assigned scope.' using errcode='42501'; end if;
 if not allow_frozen and a.role_id<>'admin' and (app_private.frozen(a.node_id) or app_private.frozen(node)) then raise exception 'Operations are frozen for this school or class.'; end if;
end $$;

create function app_private.command(action text, args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events;
 target text:=args->>0; n text; d jsonb; old jsonb; item jsonb; result jsonb:='true';
 rid uuid; i integer; count integer; role text; delta numeric; t numeric:=extract(epoch from clock_timestamp())*1000;
begin
 if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
 case
 when action in ('addSchoolNode','updateSchoolNode','archiveSchoolNode','deleteSchoolNode','replaceSchoolStructure') then
  perform pg_advisory_xact_lock(hashtext('rmc-directory'));
  n:=case when action='addSchoolNode' then nullif(target,'') else target end;
  perform app_private.assert_permission(case when action='deleteSchoolNode' then 'directory.delete_structure' else 'directory.manage_structure' end,n);
  if action='replaceSchoolStructure' then raise exception 'Edit units individually to preserve references.'; end if;
  if action='addSchoolNode' then
   if n is null and a.role_id<>'admin' then raise exception 'Only the administrator can create campuses.'; end if;
   perform app_private.write_node(n,args->1);
  elsif action='updateSchoolNode' then
   update public.rmc_nodes set data=data||jsonb_build_object('name',coalesce(args#>>'{1,name}',data->>'name'),'type',coalesce(args#>>'{1,type}',data->>'type'),'metadata',coalesce(data->'metadata','{}')||coalesce(args#>'{1,metadata}','{}')) where id=target;
   if not found then raise exception 'Unit not found.'; end if;
  elsif action='archiveSchoolNode' then
   update public.rmc_nodes set data=jsonb_set(data,'{metadata}',coalesce(data->'metadata','{}')||'{"archived":true}') where id=target;
  else
   if exists(select 1 from public.rmc_nodes where parent_id=target) or exists(select 1 from public.rmc_profiles where node_id=target)
    or exists(select 1 from public.rmc_events where node_id=target or data#>>'{audienceTarget,nodeId}'=target or data#>'{audienceTarget,groups}' ? ('node:'||target)) then return 'false'; end if;
   delete from public.rmc_nodes where id=target; result:=to_jsonb(found);
  end if;
 when action='setSectionSecurityKey' then
  perform app_private.assert_permission('directory.manage_members',target);
  if length(trim(args->>1))<8 then raise exception 'Use an enrollment key of at least 8 characters.'; end if;
  update public.rmc_nodes set enrollment_key_hash=extensions.crypt(upper(trim(args->>1)),extensions.gen_salt('bf')),data=data||'{"enrollmentKeyRequired":true}' where id=target;
  if not found then raise exception 'Section not found.'; end if;
 when action='updateContactDetails' then
  if target::uuid<>a.id then perform app_private.assert_permission('directory.manage_members',(select node_id from public.rmc_profiles where id=target::uuid)); end if;
  if app_private.frozen(a.node_id) and a.role_id<>'admin' then raise exception 'Profile updates are frozen.'; end if;
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  d:=args->1; old:=p.profile;
  if d ? 'phone' then old:=jsonb_set(old,'{phone}',to_jsonb(trim(d->>'phone'))); end if;
  if d ? 'guardianName' or d ? 'guardianContact' then
   old:=jsonb_set(old,'{guardian}',coalesce(nullif(old->'guardian','null'),'{}')||jsonb_strip_nulls(jsonb_build_object('name',d->>'guardianName','contact',d->>'guardianContact')));
  end if;
  update public.rmc_profiles set profile=old where id=p.id;
 when action in ('approveApplication','rejectApplication') then
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  perform app_private.assert_permission('directory.manage_members',p.node_id);
  select data into strict d from public.rmc_applications where id=p.id for update;
  if d->>'status'<>'pending' then raise exception 'This application has already been reviewed.'; end if;
  if action='approveApplication' then
   role:=coalesce(args->>1,'student');
   if role not in ('student','mayor') then raise exception 'Admissions may only approve student accounts.'; end if;
   if role='mayor' then perform pg_advisory_xact_lock(hashtext('mayor:'||p.node_id));
    if exists(select 1 from public.rmc_profiles where role_id='mayor' and node_id=p.node_id and status='active') then raise exception 'This section already has a mayor.'; end if;
   end if;
   old:=p.profile||jsonb_build_object('role',role,'account_status','active');
   if role='mayor' then old:=app_private.assign_profile(old,p.node_id,true); end if;
   update public.rmc_profiles set role_id=role,status='active',profile=old where id=p.id;
   update public.rmc_applications set data=data||jsonb_build_object('status','approved','reviewed_at',t,'reviewed_by',a.id,'form_data',old) where id=p.id;
  else
   if length(trim(args->>1))<3 then raise exception 'Provide a rejection reason.'; end if;
   update public.rmc_applications set data=data||jsonb_build_object('status','rejected','rejection_reason',args->>1,'rejection_count',coalesce((data->>'rejection_count')::int,0)+1,'reviewed_at',t,'reviewed_by',a.id) where id=p.id;
  end if;
 when action in ('assignSectionMayor','assignRole','assignAccountRole','assignOfficialToNode') then
  if action in ('assignAccountRole','assignOfficialToNode') then target:=args->>1; end if;
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  if p.role_id='admin' then raise exception 'System owner accounts cannot be reassigned.'; end if;
  if action='assignSectionMayor' then
   n:=args->>1; perform app_private.assert_permission('directory.manage_members',n);
   if p.node_id<>n or p.role_id not in ('student','mayor') then raise exception 'Choose a student in this section.'; end if;
   perform pg_advisory_xact_lock(hashtext('mayor:'||n));
   update public.rmc_profiles set role_id='student',profile=profile||'{"role":"student"}' where node_id=n and role_id='mayor';
   update public.rmc_profiles set role_id='mayor',profile=app_private.assign_profile(profile||'{"role":"mayor"}',n,true) where id=p.id;
  elsif action='assignOfficialToNode' then
   n:=args->>2; perform app_private.assert_permission('system.manage_accounts',n);
   if not app_private.in_scope(p.node_id) then raise exception 'This account is outside your scope.'; end if;
   update public.rmc_profiles set node_id=n,profile=app_private.assign_profile(profile,n,true) where id=p.id;
  else
   perform app_private.assert_permission('system.manage_rbac',p.node_id);
   role:=case when action='assignAccountRole' then args->>2 else args->>1 end;
   if role='admin' then raise exception 'System owner access cannot be assigned here.'; end if;
   select data into strict d from public.rmc_roles where id=role;
   if d->>'isPositionOnly'='true' then
    update public.rmc_profiles set profile=jsonb_set(profile,'{positionRoleIds}',coalesce(profile->'positionRoleIds','[]')||to_jsonb(role)) where id=p.id;
   else update public.rmc_profiles set role_id=role,profile=profile||jsonb_build_object('role',role) where id=p.id; end if;
  end if;
 when action in ('createEvent','updateEvent','archiveEvent','cancelEvent','deleteEvent') then
  if action='createEvent' then
   d:=args->0; n:=case when a.role_id='admin' then d->>'scopeNodeId' else a.node_id end;
   if a.role_id<>'admin' and n is null then raise exception 'An assigned scope is required.'; end if;
  else
   select * into strict e from public.rmc_events where id=target::uuid for update; n:=e.node_id; d:=e.data;
   if a.role_id<>'admin' and not app_private.in_scope(n) then raise exception 'This event is outside your scope.'; end if;
   if action='updateEvent' then
    if exists(select 1 from public.rmc_attendance where event_id=e.id) then raise exception 'Events with attendance records cannot be edited. Archive or cancel this event.'; end if;
    d:=d||(args->1); end if;
  end if;
  perform app_private.assert_permission('events.manage',n);
  if action in ('createEvent','updateEvent') then
   if coalesce(length(trim(d->>'title')),0)=0 or (d->>'endTime')::numeric <= (d->>'startTime')::numeric then raise exception 'Enter a title and a valid event schedule.'; end if;
   if (d->>'endTime')::numeric-(d->>'startTime')::numeric>366*86400000::numeric then raise exception 'An event may span at most one year.'; end if;
   if d->>'kind'='merit' and coalesce((d->>'meritHours')::numeric,0)<=0 then raise exception 'Merit hours must be positive.'; end if;
   if coalesce((d->>'penaltyValue')::numeric,0)<0 or coalesce((d#>>'{sanctionRules,late,value}')::numeric,0)<0 or coalesce((d#>>'{sanctionRules,absent,value}')::numeric,0)<0 then raise exception 'Sanctions must not be negative.'; end if;
   if coalesce(d->>'geofenceEnabled','true')='true' and (coalesce((d#>>'{location,radius_meters}')::numeric,0)<=0 or abs((d#>>'{location,lat}')::numeric)>90 or abs((d#>>'{location,lng}')::numeric)>180) then raise exception 'Enter a valid geofence.'; end if;
   for item in select jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) loop
    if item->>'timeIn' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'timeOut' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'timeOut'<=item->>'timeIn' or (item->>'lateAfterMinutes')::numeric<0 then raise exception 'Invalid attendance window.'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) w1,jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) w2 where w1->>'id'<>w2->>'id' and w1->>'timeIn'<w2->>'timeOut' and w2->>'timeIn'<w1->>'timeOut') then raise exception 'Attendance windows must not overlap.'; end if;
   count:=case when action='createEvent' then coalesce((d#>>'{recurrence,occurrences}')::int,1) else 1 end;
   if count<1 or count>52 then raise exception 'Choose 1 to 52 weekly occurrences.'; end if;
   rid:=case when action='createEvent' then gen_random_uuid() else e.id end;
   for i in 0..count-1 loop
    old:=d||jsonb_build_object('id',case when i=0 then rid else gen_random_uuid() end,'created_by',case when action='createEvent' then a.id else e.created_by end,'scopeNodeId',n,'timestamp',t,
     'startTime',(d->>'startTime')::numeric+i*604800000::numeric,'endTime',(d->>'endTime')::numeric+i*604800000::numeric,
     'startDate',to_char(to_timestamp((d->>'startTime')::numeric/1000)+i*interval '7 days' at time zone 'Asia/Manila','YYYY-MM-DD'),
     'endDate',to_char(to_timestamp((d->>'endTime')::numeric/1000)+i*interval '7 days' at time zone 'Asia/Manila','YYYY-MM-DD'),'seriesId',case when count>1 then rid else null end);
    if action='createEvent' then insert into public.rmc_events(id,data,created_by,node_id,start_at,end_at) values((old->>'id')::uuid,old,a.id,n,to_timestamp((old->>'startTime')::numeric/1000),to_timestamp((old->>'endTime')::numeric/1000));
    else update public.rmc_events set data=old,start_at=to_timestamp((old->>'startTime')::numeric/1000),end_at=to_timestamp((old->>'endTime')::numeric/1000) where id=rid; end if;
   end loop;
   result:=to_jsonb(rid);
  elsif action='deleteEvent' then
   if exists(select 1 from public.rmc_attendance where event_id=e.id) or exists(select 1 from public.rmc_excuses where event_id=e.id) or exists(select 1 from public.rmc_sanctions where event_id=e.id) then raise exception 'Archive events that have records.'; end if;
   delete from public.rmc_events where id=e.id;
  elsif action='archiveEvent' then
   if e.end_at>now() then raise exception 'Wait for the event to end or cancel it.'; end if;
   update public.rmc_events set data=data||'{"status":"done"}' where id=e.id;
  else
   update public.rmc_events set data=data||'{"status":"done","cancellationStatus":"cancelled"}',finalized_at=now() where id=e.id;
  end if;
 when action in ('adjustSanctionHours','resolveStudentSanctions') then
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  perform app_private.assert_permission('ossa.manage_cases',p.node_id);
  delta:=case when action='resolveStudentSanctions' then -app_private.balance(p.id) else (args->>1)::numeric end;
  n:=case when action='resolveStudentSanctions' then args->>1 else args->>2 end;
  if coalesce(length(trim(n)),0)<3 then raise exception 'Enter the reason for this adjustment.'; end if;
  perform app_private.sanction(p.id,delta,n);
 when action='submitExcuseApplication' then
  if app_private.frozen(a.node_id) then raise exception 'Excuse submissions are frozen.'; end if;
  d:=args->0; rid:=(d->>'event_id')::uuid;
  select * into strict e from public.rmc_events where id=rid;
  if not app_private.recipient(e.data,a.profile) then raise exception 'Select an event assigned to you.'; end if;
  if coalesce(length(trim(d->>'reason')),0)<10 or d->>'category' not in ('medical','personal','institutional','emergency') then raise exception 'Enter a valid category and at least 10 characters of explanation.'; end if;
  if d->>'proof_url' is not null and d->>'proof_url' not like 'storage://' || a.id::text || '/%' then raise exception 'Invalid attachment owner.'; end if;
  rid:=gen_random_uuid(); d:=d||jsonb_build_object('id',rid,'student_uid',a.id,'student_name',a.profile->>'name','student_id',a.profile->>'student_id','department',a.profile#>>'{school_data,department}','section',a.profile#>>'{school_data,section}','event_title',e.data->>'title','event_date',e.data->>'startDate','status','pending','submission_date',t);
  insert into public.rmc_excuses(id,student_id,event_id,data) values(rid,a.id,e.id,d); result:=d;
 when action='reviewExcuseApplication' then
  select data into strict d from public.rmc_excuses where id=target::uuid for update;
  select * into strict p from public.rmc_profiles where id=(d->>'student_uid')::uuid for update;
  perform app_private.assert_permission('ossa.manage_cases',p.node_id);
  if d->>'status'<>'pending' then raise exception 'This excuse has already been reviewed.'; end if;
  role:=args->>1; delta:=coalesce((args->>3)::numeric,0);
  if role not in ('approved','rejected') or delta<0 then raise exception 'Invalid review.'; end if;
  if role='approved' and delta>0 then perform app_private.sanction(p.id,-delta,'Approved excuse: '||(args->>2),(d->>'event_id')::uuid,'excuse:'||target); end if;
  update public.rmc_excuses set data=data||jsonb_build_object('status',role,'review_notes',args->>2,'waived_hours',delta,'reviewed_at',t,'reviewed_by',a.profile->>'name') where id=target::uuid;
 when action in ('setSystemFreezeStatus','setNodeFreezeStatus') then
  perform app_private.assert_permission('system.freeze',null,true);
  if action='setSystemFreezeStatus' then
   update public.rmc_settings set data=jsonb_build_object('isFrozen',(args->>0)::boolean,'reason',coalesce(args->>1,''),'frozenAt',t,'frozenBy',a.profile->>'name') where id='system_freeze' returning data into result;
  else
   if not exists(select 1 from public.rmc_nodes where id=target) then raise exception 'Unit not found.'; end if;
   update public.rmc_settings set data=case when (args->>1)::boolean then data||jsonb_build_object(target,jsonb_build_object('isFrozen',true,'reason',coalesce(args->>2,''),'frozenAt',t,'frozenBy',a.profile->>'name')) else data-target end where id='frozen_nodes' returning data into result;
  end if;
 when action in ('createCustomRole','updateCoreRole','updateCustomRole','deleteCustomRole') then
  perform app_private.assert_permission('system.manage_rbac',null,true);
  if target='admin' then raise exception 'The system owner role is protected.'; end if;
  if action='createCustomRole' then
   target:='role_'||gen_random_uuid()::text; d:=(args->0)||jsonb_build_object('id',target,'createdAt',t,'createdBy',a.id,'isBuiltIn',false);
   insert into public.rmc_roles(id,data) values(target,d); result:=d;
  elsif action='deleteCustomRole' then
   if exists(select 1 from public.rmc_roles where id=target and data->>'isBuiltIn'='true') then raise exception 'Built-in roles cannot be removed.'; end if;
   if exists(select 1 from public.rmc_profiles where role_id=target or profile->'positionRoleIds' ? target) then raise exception 'Reassign accounts before deleting this role.'; end if;
   delete from public.rmc_roles where id=target;
  else
   update public.rmc_roles set data=data||(args->1)||jsonb_build_object('id',target,'updatedAt',t,'isBuiltIn',data->'isBuiltIn') where id=target returning data into result;
  end if;
 when action in ('updatePaymentInfo','sendPaymentReminderToOSAS') then
  perform app_private.assert_permission('system.payment_reminders',null,true);
  if action='updatePaymentInfo' then
   if coalesce((args#>>'{0,amountDue}')::numeric,0)<0 then raise exception 'Amount must not be negative.'; end if;
   update public.rmc_settings set data=data||((args->0)-'reminders') where id='payment_info' returning data into result;
  else
   d:=(args->0)||jsonb_build_object('id',gen_random_uuid(),'sentAt',t,'sentBy',a.profile->>'name','recipientRole','OSSA Administrator','status','in_app');
   update public.rmc_settings set data=jsonb_set(data,'{reminders}',jsonb_build_array(d)||coalesce(data->'reminders','[]')) where id='payment_info'; result:=d;
  end if;
 else raise exception 'Unsupported operation: %',action;
 end case;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,action,coalesce(target,''),jsonb_build_object('actor_name',a.profile->>'name','target_name',coalesce(target,'')));
 return result;
end $$;
create function public.rmc_command(action text, args jsonb default '[]') returns jsonb language sql security invoker set search_path='' as $$ select app_private.command(action,args) $$;

create function app_private.provision_check(person jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); n text:=coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}'); r text:=coalesce(person->>'role','student'); kind text;
begin
 perform app_private.assert_permission(case when r='student' then 'directory.manage_members' else 'system.manage_accounts' end,n);
 if r not in ('student','mayor','ssg','ossa','ossa_staff') then raise exception 'Invalid account role.'; end if;
 if a.role_id<>'admin' and (r in ('ossa','ossa_staff') or (a.role_id='ssg' and r='ssg')) then raise exception 'You cannot create an account with this level of access.'; end if;
 select data->>'type' into kind from public.rmc_nodes where id=n;
 if (r in ('student','mayor') and kind not in ('section','block')) or (r in ('ossa','ossa_staff') and kind<>'campus') or (r='ssg' and kind='campus') then raise exception 'This role cannot be assigned to this unit.'; end if;
 if exists(select 1 from public.rmc_profiles where lower(profile->>'email')=lower(person->>'email') or lower(profile->>'username')=lower(person->>'username') or lower(profile->>'student_id')=lower(person->>'student_id')) then raise exception 'Email, username, or student ID already exists.'; end if;
 return app_private.assign_profile(person,n,r<>'student');
end $$;
create function public.rmc_provision_check(person jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.provision_check(person) $$;
create function app_private.provision_complete(accounts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; d jsonb; p public.rmc_profiles; n text; r text;
begin
 for item in select jsonb_array_elements(accounts) loop
  d:=item->'profile'; n:=coalesce(d#>>'{official_data,assignment_node_id}',d#>>'{school_data,academic_assignment,terminalGroupId}'); r:=d->>'role';
  perform app_private.assert_permission(case when r='student' then 'directory.manage_members' else 'system.manage_accounts' end,n);
  if r not in ('student','mayor','ssg','ossa','ossa_staff') or ((select role_id from app_private.actor())<>'admin' and (r in ('ossa','ossa_staff') or ((select role_id from app_private.actor())='ssg' and r='ssg'))) then raise exception 'Invalid role assignment.'; end if;
  select * into strict p from public.rmc_profiles where id=(item->>'uid')::uuid for update;
  if p.status<>'pending' or not exists(select 1 from auth.users where id=p.id and raw_app_meta_data->>'rmc_provisioned'='true' and raw_app_meta_data->>'provisioned_by'=auth.uid()::text) then raise exception 'Invalid account provisioning request.'; end if;
  if r='mayor' then
   perform pg_advisory_xact_lock(hashtext('mayor:'||n));
   if exists(select 1 from public.rmc_profiles where node_id=n and role_id='mayor' and status='active') then raise exception 'This section already has a mayor.'; end if;
  end if;
  d:=app_private.assign_profile(p.profile||jsonb_build_object('role',r,'account_status','active','official_data',d->'official_data'),n,r<>'student');
  update public.rmc_profiles set profile=d,status='active',role_id=r,node_id=n where id=p.id;
  delete from public.rmc_applications where id=p.id;
  insert into public.rmc_audit(actor_id,action,target,data) values(auth.uid(),'account.created',p.id::text,jsonb_build_object('actor_name',(select profile->>'name' from app_private.actor()),'target_name',d->>'name'));
 end loop;
 return accounts;
end $$;
create function public.rmc_provision_complete(accounts jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.provision_complete(accounts) $$;
create function app_private.deactivate_account(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles;
begin
 select * into strict p from public.rmc_profiles where id=target for update;
 perform app_private.assert_permission('system.manage_accounts',p.node_id);
 if p.role_id in ('admin','student') or p.id=auth.uid() then raise exception 'This account cannot be removed here.'; end if;
 update public.rmc_profiles set status='inactive',profile=profile||'{"account_status":"inactive"}' where id=target;
 insert into public.rmc_audit(actor_id,action,target,data) values(auth.uid(),'account.deactivated',target::text,jsonb_build_object('actor_name',(select profile->>'name' from app_private.actor()),'target_name',p.profile->>'name'));
end $$;
create function public.rmc_deactivate_account(target uuid) returns void language sql security invoker set search_path='' as $$ select app_private.deactivate_account(target) $$;

create function app_private.issue_qr() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); token text:=encode(extensions.gen_random_bytes(32),'hex'); expires timestamptz:=now()+interval '90 seconds';
begin
 if a.id is null or a.role_id not in ('student','mayor','ssg') then raise exception 'An active student account is required.'; end if;
 if app_private.frozen(a.node_id) then raise exception 'Attendance is frozen for your unit.'; end if;
 delete from app_private.qr_tokens where student_id=a.id and expires_at<now();
 insert into app_private.qr_tokens values(encode(extensions.digest(token,'sha256'),'hex'),a.id,expires);
 return jsonb_build_object('token','RMC1:'||token,'expiresAt',extract(epoch from expires)*1000);
end $$;
create function public.rmc_issue_qr() returns jsonb language sql security invoker set search_path='' as $$ select app_private.issue_qr() $$;
create function app_private.resolve_qr(token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles;
begin
 perform app_private.assert_permission('attendance.scan');
 if token !~ '^RMC1:[0-9a-f]{64}$' then raise exception 'Invalid QR code. Ask the student to open their current QR.'; end if;
 select p1.* into p from app_private.qr_tokens q join public.rmc_profiles p1 on p1.id=q.student_id
  where q.token_hash=encode(extensions.digest(substring(token from 6),'sha256'),'hex') and q.expires_at>now() and p1.status='active';
 if p.id is null then raise exception 'QR code expired. Ask the student to refresh it.'; end if;
 perform app_private.assert_permission('attendance.scan',p.node_id);
 return p.profile;
end $$;
create function public.rmc_resolve_qr(token text) returns jsonb language sql security invoker set search_path='' as $$ select app_private.resolve_qr(token) $$;

create function app_private.record_attendance(event_id uuid,student_id uuid,direction text,qr_token text,scan_position jsonb,manual_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric;
begin
 perform app_private.assert_permission('attendance.scan');
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 perform app_private.assert_permission('attendance.scan',p.node_id);
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is not null then
  if (app_private.resolve_qr(qr_token)->>'uid')::uuid<>p.id then raise exception 'QR does not match this student.'; end if;
 elsif coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 if not app_private.recipient(e.data,p.profile) then raise exception 'Student is not a recipient of this event.'; end if;
 if e.data->>'cancellationStatus' is not null or e.data->>'status'='done' or now()<e.start_at or now()>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(coalesce(e.data->'attendanceWindows','[]'))>0 then
  select value into w from jsonb_array_elements(e.data->'attendanceWindows') where local_now::time between (value->>'timeIn')::time and (value->>'timeOut')::time limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record is not null then return record||'{"already_recorded":true}'; end if;
  status:=case when now()>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'manual' else 'qr' end,'manual_reason',manual_reason);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if status='late' and e.data->>'kind' not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null then raise exception 'Scan in before scanning out.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  earned:=case e.data->>'kind' when 'service' then greatest(0,(stamp-(record->>'time_in')::numeric)/3600000) when 'merit' then coalesce((e.data->>'meritHours')::numeric,0) else 0 end;
  if e.data->>'kind'='merit' and exists(select 1 from public.rmc_sanctions where source='merit:'||e.id::text||':'||p.id::text) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Service / merit: '||(e.data->>'title'),e.id,case when e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end); end if;
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',greatest(0,(stamp-(record->>'time_in')::numeric)/3600000),'deducted_hours',deducted);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $$;
create function public.rmc_record_attendance(event_id uuid,student_id uuid,direction text,qr_token text default null,scan_position jsonb default null,manual_reason text default null) returns jsonb language sql security invoker set search_path='' as $$ select app_private.record_attendance(event_id,student_id,direction,qr_token,scan_position,manual_reason) $$;

create function app_private.finalize_events() returns void language plpgsql security definer set search_path='' as $$
declare e public.rmc_events; p public.rmc_profiles; w jsonb; day date; slot_id text; penalty numeric; state text;
begin
 for e in select * from public.rmc_events where end_at<now() and finalized_at is null order by end_at for update skip locked limit 50 loop
  if e.data->>'cancellationStatus' is null and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   penalty:=coalesce((e.data#>>'{sanctionRules,absent,value}')::numeric,(e.data->>'penaltyValue')::numeric,0)/case when coalesce(e.data#>>'{sanctionRules,absent,unit}',e.data->>'penaltyUnit')='minutes' then 60 else 1 end;
   for p in select * from public.rmc_profiles where status='active' and role_id in ('student','mayor','ssg') and created_at<=e.start_at loop
    if not app_private.recipient(e.data,p.profile) then continue; end if;
    state:=case when exists(select 1 from public.rmc_excuses where event_id=e.id and student_id=p.id and data->>'status'='approved') then 'excused' else 'absent' end;
    for day in select generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day')::date loop
     for w in select value from jsonb_array_elements(case when jsonb_array_length(coalesce(e.data->'attendanceWindows','[]'))>0 then e.data->'attendanceWindows' else '[{"id":"default"}]' end) loop
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

create function public.rmc_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'profiles',coalesce((select jsonb_agg(profile||jsonb_build_object('uid',id,'role',role_id,'account_status',status)) from public.rmc_profiles),'[]'),
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'data',data)) from public.rmc_nodes),'[]'),
 'roles',coalesce((select jsonb_object_agg(id,data) from public.rmc_roles),'{}'),
 'applications',coalesce((select jsonb_agg(data) from public.rmc_applications),'[]'),
 'events',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'status',case when data->>'status'='done' or end_at<now() then 'done' when start_at<=now() then 'active' else 'upcoming' end)) from public.rmc_events),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('event_id',event_id,'student_id',student_id,'slot',slot,'data',data)) from public.rmc_attendance),'[]'),
 'sanctions',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'data',data||jsonb_build_object('id',id))) from public.rmc_sanctions),'[]'),
 'excuses',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'event_id',event_id)) from public.rmc_excuses),'[]'),
 'settings',coalesce((select jsonb_object_agg(id,data) from public.rmc_settings),'{}'),
 'audit',coalesce((select jsonb_agg(row_data) from (select data||jsonb_build_object('id',id,'action',action,'actor_uid',actor_id,'target_uid',target,'timestamp',extract(epoch from created_at)*1000) row_data from public.rmc_audit order by created_at desc limit 500) logs),'[]')
 )
$$;
-- Admission documents and proof files are private and limited to their owner or a scoped reviewer.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rmc-documents','rmc-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy rmc_document_insert on storage.objects for insert to authenticated with check (bucket_id='rmc-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy rmc_document_read on storage.objects for select to authenticated using (bucket_id='rmc-documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or ((app_private.permitted('directory.manage_members') or app_private.permitted('ossa.manage_cases')) and app_private.can_read_profile(((storage.foldername(name))[1])::uuid))));
create policy rmc_document_delete on storage.objects for delete to authenticated using (bucket_id='rmc-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Explicit grants: internal helpers that bypass RLS are never anonymous endpoints.
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.actor(),app_private.permitted(text),app_private.path(text),app_private.in_scope(text),app_private.can_read_profile(uuid),app_private.can_read_event(uuid) to authenticated;
grant execute on function app_private.command(text,jsonb),app_private.provision_check(jsonb),app_private.provision_complete(jsonb),app_private.deactivate_account(uuid),app_private.issue_qr(),app_private.resolve_qr(text),app_private.record_attendance(uuid,uuid,text,text,jsonb,text) to authenticated;
revoke all on function public.rmc_snapshot(),public.rmc_command(text,jsonb),public.rmc_provision_check(jsonb),public.rmc_provision_complete(jsonb),public.rmc_deactivate_account(uuid),public.rmc_issue_qr(),public.rmc_resolve_qr(text),public.rmc_record_attendance(uuid,uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.rmc_snapshot(),public.rmc_command(text,jsonb),public.rmc_provision_check(jsonb),public.rmc_provision_complete(jsonb),public.rmc_deactivate_account(uuid),public.rmc_issue_qr(),public.rmc_resolve_qr(text),public.rmc_record_attendance(uuid,uuid,text,text,jsonb,text) to authenticated;

insert into public.rmc_roles(id,data) values
('admin','{"id":"admin","name":"System Owner / Super Admin","description":"Full administrative access across all system nodes and controls","isPositionOnly":false,"permissions":["system.manage_accounts","system.view_audit","system.freeze","system.health","system.payment_reminders","system.manage_rbac","directory.manage_structure","directory.delete_structure","directory.manage_members","attendance.scan","attendance.manage","events.manage","ossa.manage_cases"],"isBuiltIn":true}'),
('ossa','{"id":"ossa","name":"OSSA Administrator","description":"Directs student discipline, excuses, and institutional sanction cases","isPositionOnly":false,"permissions":["directory.manage_structure","directory.manage_members","attendance.scan","attendance.manage","events.manage","ossa.manage_cases","system.health","system.manage_accounts"],"isBuiltIn":true}'),
('ossa_staff','{"id":"ossa_staff","name":"OSSA Staff","description":"Scans attendance and reviews student excuse applications","isPositionOnly":false,"permissions":["attendance.scan","attendance.manage","ossa.manage_cases"],"isBuiltIn":true}'),
('ssg','{"id":"ssg","name":"SSG Officer","description":"Manages events, geofencing, and directory section rosters","isPositionOnly":false,"permissions":["directory.manage_structure","directory.manage_members","attendance.scan","attendance.manage","events.manage","system.manage_accounts"],"isBuiltIn":true}'),
('mayor','{"id":"mayor","name":"Mayor / Attendance Officer","description":"Scans class QR codes and records student attendance","isPositionOnly":false,"permissions":["attendance.scan"],"isBuiltIn":true}'),
('student','{"id":"student","name":"Student","description":"Personal attendance QR, event history, and excuse submission","isPositionOnly":false,"permissions":[],"isBuiltIn":true}');
