-- Apply the role_recipient_groups migration first. All fixtures roll back.
begin;
do $$
declare role_id text; person jsonb; ev jsonb; scope text := 'role-audience-test-'||gen_random_uuid(); outside text := scope||'-outside'; custom_id text := scope||'-adviser'; admin_id uuid; draft jsonb; sid uuid;
begin
 select p.id into strict admin_id from public.rmc_profiles p where p.is_test_account and p.role_id='admin' and p.status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values(scope,'{"name":"Role audience test","type":"section"}'),(outside,'{"name":"Outside","type":"section"}');
 insert into public.rmc_roles(id,data) values(custom_id,jsonb_build_object('id',custom_id,'name','Faculty Advisers','isPositionOnly',true,'permissions','[]'::jsonb));
 for role_id in select id from public.rmc_roles where id<>'admin' loop
  ev:=jsonb_build_object('scopeNodeId',scope,'recipientGroups',jsonb_build_array('role:'||role_id));
  person:=jsonb_build_object('uid',gen_random_uuid(),'role',role_id,'official_data',jsonb_build_object('assignment_node_id',scope));
  if not app_private.recipient(ev,person) then raise exception 'Role % did not match',role_id; end if;
  if app_private.recipient(ev,jsonb_set(person,'{official_data,assignment_node_id}',to_jsonb(outside))) then raise exception 'Outside role matched'; end if;
  if app_private.recipient(ev,jsonb_set(person,'{role}','"admin"')) then raise exception 'Admin matched role audience'; end if;
  if app_private.recipient(ev||'{"approvalStatus":"pending"}',person) then raise exception 'Pending event matched'; end if;
 end loop;
 ev:=jsonb_build_object('recipientGroups',jsonb_build_array('role:'||custom_id));
 person:=jsonb_build_object('role','student','positionRoleIds',jsonb_build_array(custom_id));
 if not app_private.recipient(ev,person) then raise exception 'Assigned custom position did not match'; end if;
 if app_private.recipient(ev,jsonb_set(person,'{positionRoleIds}','[]')) then raise exception 'Unassigned position matched'; end if;
 if app_private.recipient('{"recipientGroups":["role:admin"]}','{"role":"admin"}') then raise exception 'Admin group matched'; end if;
 select p.id into strict admin_id from public.rmc_profiles p where p.is_test_account and p.role_id='admin' and p.status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 draft:=jsonb_build_object('title','Role audience notice','starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 1 hour','scope_node_id',scope);
 for role_id in select id from public.rmc_roles where id<>'admin' loop
  sid:=public.rmc_save_calendar_schedule(null,draft||jsonb_build_object('recipients',jsonb_build_array('role:'||role_id)));
  if sid is null then raise exception 'Role schedule not saved'; end if;
 end loop;
 foreach role_id in array array['admin',scope||'-missing'] loop
  begin
   perform public.rmc_save_calendar_schedule(null,draft||jsonb_build_object('recipients',jsonb_build_array('role:'||role_id)));
   raise exception 'Invalid role accepted' using errcode='P0002';
  exception when sqlstate 'P0001' then
   if sqlerrm<>'Invalid recipient role.' then raise; end if;
  end;
 end loop;
end $$;
select 'role recipient matching, scope, positions, and schedule validation passed' as result;
rollback;
