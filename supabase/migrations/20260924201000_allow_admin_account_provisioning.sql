-- Administrators can create additional administrator accounts without an
-- academic assignment. Scoped roles continue to require a valid unit.
create or replace function app_private.provision_check(person jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); n text:=coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}'); r text:=coalesce(person->>'role','student'); kind text;
begin
 if r='admin' then
   if a.role_id<>'admin' then raise exception 'Only an administrator can create administrator accounts.'; end if;
   perform app_private.assert_permission('system.manage_accounts',null,true);
 elsif r in ('ossa','ossa_staff','ssg') then
   perform app_private.assert_permission('system.manage_accounts',n);
 else
   perform app_private.assert_permission('directory.manage_members',n);
 end if;
 if r not in ('student','mayor','ssg','ossa','ossa_staff','admin') then raise exception 'Invalid account role.'; end if;
 if r in ('ossa','ossa_staff') and a.role_id<>'admin' then raise exception 'You cannot create an account with this level of access.'; end if;
 if a.role_id='ssg' and r='ssg' then raise exception 'You cannot create an account with this level of access.'; end if;
 if r<>'admin' then
   select data->>'type' into kind from public.rmc_nodes where id=n;
   if (r in ('student','mayor') and kind not in ('section','block')) or (r in ('ossa','ossa_staff') and kind<>'campus') or (r='ssg' and kind='campus') then raise exception 'This role cannot be assigned to this unit.'; end if;
 end if;
 if exists(select 1 from public.rmc_profiles where lower(profile->>'email')=lower(person->>'email') or lower(profile->>'username')=lower(person->>'username') or lower(profile->>'student_id')=lower(person->>'student_id')) then raise exception 'Email, username, or student ID already exists.'; end if;
 return case when r='admin' then person else app_private.assign_profile(person,n,r<>'student') end;
end $$;

create or replace function app_private.provision_complete(accounts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; d jsonb; p public.rmc_profiles; n text; r text; actor_role text:=(select role_id from app_private.actor());
begin
 for item in select jsonb_array_elements(accounts) loop
  d:=item->'profile'; n:=coalesce(d#>>'{official_data,assignment_node_id}',d#>>'{school_data,academic_assignment,terminalGroupId}'); r:=d->>'role';
  if r='admin' then
    if actor_role<>'admin' then raise exception 'Only an administrator can create administrator accounts.'; end if;
    perform app_private.assert_permission('system.manage_accounts',null,true);
  else
    perform app_private.assert_permission(case when r='student' then 'directory.manage_members' else 'system.manage_accounts' end,n);
  end if;
  if r not in ('student','mayor','ssg','ossa','ossa_staff','admin') then raise exception 'Invalid role assignment.'; end if;
  if r in ('ossa','ossa_staff') and actor_role<>'admin' then raise exception 'Invalid role assignment.'; end if;
  select * into strict p from public.rmc_profiles where id=(item->>'uid')::uuid for update;
  if p.status<>'pending' or not exists(select 1 from auth.users where id=p.id and raw_app_meta_data->>'rmc_provisioned'='true' and raw_app_meta_data->>'provisioned_by'=auth.uid()::text) then raise exception 'Invalid account provisioning request.'; end if;
  d:=case when r='admin' then p.profile||jsonb_build_object('role',r,'account_status','active') else app_private.assign_profile(p.profile||jsonb_build_object('role',r,'account_status','active','official_data',d->'official_data'),n,r<>'student') end;
  update public.rmc_profiles set profile=d,status='active',role_id=r,node_id=n where id=p.id;
  delete from public.rmc_applications where id=p.id;
  insert into public.rmc_audit(actor_id,action,target,data) values(auth.uid(),'account.created',p.id::text,jsonb_build_object('actor_name',(select profile->>'name' from app_private.actor()),'target_name',d->>'name'));
 end loop;
 return accounts;
end $$;
