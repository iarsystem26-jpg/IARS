-- Demo identities and role settings change only in a rolled-back transaction.
begin;
do $$
declare
  v_ssg uuid; v_student uuid; v_mayor uuid; v_owner uuid;
  scope_a text := 'designation-test-scope-a'; scope_b text := 'designation-test-scope-b';
  class_a text := 'designation-test-class-a'; class_b text := 'designation-test-class-b';
  original_role jsonb; identity_before jsonb; assignment_before jsonb;
  attendance_before bigint; sanctions_before bigint; credits_before bigint;
begin
  select id into strict v_ssg from public.rmc_profiles where is_test_account and role_id='ssg' and profile->>'username'='ssg';
  select id into strict v_student from public.rmc_profiles where is_test_account and role_id='student' and profile->>'username'='student';
  select id into strict v_mayor from public.rmc_profiles where is_test_account and role_id='mayor' and profile->>'username'='mayor';
  select id into strict v_owner from public.rmc_profiles where is_test_account and role_id='admin' and profile->>'username'='admin';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal2')::text,true);
  insert into public.rmc_nodes(id,data) values
    (scope_a,jsonb_build_object('id',scope_a,'name','Designation test A','type','education_unit')),
    (scope_b,jsonb_build_object('id',scope_b,'name','Designation test B','type','education_unit'));
  insert into public.rmc_nodes(id,parent_id,data) values
    (class_a,scope_a,jsonb_build_object('id',class_a,'name','Class A','type','section')),
    (class_b,scope_b,jsonb_build_object('id',class_b,'name','Class B','type','section'));
  update public.rmc_settings set data='{"isFrozen":false}' where id='system_freeze';
  update public.rmc_profiles set node_id=scope_a,profile=app_private.assign_profile(profile,scope_a,true) where id=v_ssg;
  update public.rmc_profiles set node_id=class_a,profile=app_private.assign_profile(profile,class_a,role_id='mayor') where id in (v_student,v_mayor);
  select data into original_role from public.rmc_roles where id='ssg';
  if not (original_role->'permissions' ? 'directory.change_member_designation')
    or original_role->'permissions' ? 'system.manage_rbac' then
    raise exception 'TEST FAILED: SSG requires designation access without full RBAC';
  end if;
  select profile - array['role','official_data','school_data'], profile#>'{school_data,academic_assignment}'
    into identity_before,assignment_before from public.rmc_profiles where id=v_student;
  select count(*) into attendance_before from public.rmc_attendance where student_id=v_student;
  select count(*) into sanctions_before from public.rmc_sanctions where student_id=v_student;
  select count(*) into credits_before from public.rmc_merit_credits where student_id=v_student;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ssg,'role','authenticated','aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub','',true);

  -- Promotion replaces the previous Mayor; demotion needs no RBAC permission.
  perform public.rmc_command('assignSectionMayor',jsonb_build_array(v_student,class_a,'Untrusted display name'));
  if (select role_id from public.rmc_profiles where id=v_student)<>'mayor'
    or (select profile#>>'{official_data,scope}' from public.rmc_profiles where id=v_student)<>'Class A'
    or (select role_id from public.rmc_profiles where id=v_mayor)<>'student'
    or (select profile ? 'official_data' from public.rmc_profiles where id=v_mayor)
    or (select count(*) from public.rmc_profiles where node_id=class_a and role_id='mayor' and status='active')<>1 then
    raise exception 'TEST FAILED: scoped appointment or previous-Mayor cleanup';
  end if;
  perform public.rmc_command('assignRole',jsonb_build_array(v_student,'student',class_a));
  if (select role_id from public.rmc_profiles where id=v_student)<>'student'
    or (select profile->>'role' from public.rmc_profiles where id=v_student)<>'student'
    or (select profile ? 'official_data' from public.rmc_profiles where id=v_student) then
    raise exception 'TEST FAILED: return to Student did not clear Mayor designation';
  end if;
  -- Existing clients can omit the optional expected class.
  perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor'));
  perform public.rmc_command('assignRole',jsonb_build_array(v_student,'student'));
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'student',class_b));
    raise exception 'TEST FAILED: stale class accepted';
  exception when serialization_failure then null; end;
  update public.rmc_profiles set node_id=class_b,profile=app_private.assign_profile(profile,class_b,false) where id=v_student;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_b));
    raise exception 'TEST FAILED: another scope accepted';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set node_id=null where id=v_student;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor'));
    raise exception 'TEST FAILED: unassigned target accepted';
  exception when invalid_parameter_value then null; end;
  update public.rmc_profiles set node_id=class_a,profile=app_private.assign_profile(profile,class_a,false) where id=v_student;
  begin
    perform public.rmc_command('assignSectionMayor',jsonb_build_array(v_student,null));
    raise exception 'TEST FAILED: missing class accepted';
  exception when invalid_parameter_value then null; end;

  -- Staff and system access-role changes remain protected by general RBAC.
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'ossa'));
    raise exception 'TEST FAILED: SSG assigned privileged staff role';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rmc_command('assignAccountRole',jsonb_build_array(v_ssg,v_student,'ssg'));
    raise exception 'TEST FAILED: SSG used general role management';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set role_id='ossa',profile=profile||'{"role":"ossa"}' where id=v_student;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'student',class_a));
    raise exception 'TEST FAILED: designation API changed a staff account';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set role_id='student',profile=profile||'{"role":"student"}' where id=v_student;

  -- Legacy member management cannot substitute for revoked designation access.
  update public.rmc_roles set data=jsonb_set(data,'{permissions}','["directory.manage_members"]') where id='ssg';
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: revoked permission accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rmc_command('assignSectionMayor',jsonb_build_array(v_student,class_a));
    raise exception 'TEST FAILED: legacy appointment bypassed revocation';
  exception when insufficient_privilege then null; end;
  update public.rmc_roles set data=jsonb_set(data,'{permissions}','["directory.change_member_designation"]') where id='ssg';
  perform public.rmc_command('assignSectionMayor',jsonb_build_array(v_student,class_a));
  perform public.rmc_command('assignRole',jsonb_build_array(v_student,'student',class_a));
  update public.rmc_roles set data=jsonb_set(data,'{isPositionOnly}','true') where id='ssg';
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: position-only role accepted';
  exception when insufficient_privilege then null; end;
  update public.rmc_roles set data=original_role where id='ssg';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_student,'role','authenticated','aal','aal2')::text,true);
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: Student self-appointed Mayor';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_mayor,'role','authenticated','aal','aal2')::text,true);
  begin
    perform public.rmc_command('assignSectionMayor',jsonb_build_array(v_student,class_a));
    raise exception 'TEST FAILED: Mayor managed designations';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: anonymous designation accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ssg,'role','authenticated','aal','aal2')::text,true);
  update public.rmc_profiles set status='inactive',profile=profile||'{"account_status":"inactive"}' where id=v_ssg;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: inactive actor accepted';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set status='active',profile=profile||'{"account_status":"active"}' where id=v_ssg;
  update public.rmc_profiles set status='pending',profile=profile||'{"account_status":"pending"}' where id=v_student;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: pending applicant accepted';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set status='active',profile=profile||'{"account_status":"active"}' where id=v_student;

  insert into public.rmc_account_freezes(account_id,reason,frozen_by) values(v_ssg,'Designation test',v_owner);
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: frozen actor accepted';
  exception when insufficient_privilege then null; end;
  delete from public.rmc_account_freezes where account_id=v_ssg;
  insert into public.rmc_account_freezes(account_id,reason,frozen_by) values(v_student,'Designation test',v_owner);
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: frozen student accepted';
  exception when insufficient_privilege then null; end;
  delete from public.rmc_account_freezes where account_id=v_student;
  update public.rmc_settings set data=data||jsonb_build_object(class_a,jsonb_build_object('isFrozen',true,'reason','Designation test')) where id='frozen_nodes';
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: frozen class accepted';
  exception when others then
    if sqlerrm not like 'Operations are frozen%' then raise; end if;
  end;
  update public.rmc_settings set data=data-class_a where id='frozen_nodes';
  update public.rmc_profiles set node_id=null where id=v_ssg;
  begin
    perform public.rmc_command('assignRole',jsonb_build_array(v_student,'mayor',class_a));
    raise exception 'TEST FAILED: unassigned officer accepted';
  exception when insufficient_privilege then null; end;
  update public.rmc_profiles set node_id=scope_a where id=v_ssg;

  if (select profile - array['role','official_data','school_data'] from public.rmc_profiles where id=v_student) is distinct from identity_before
    or (select profile#>'{school_data,academic_assignment}' from public.rmc_profiles where id=v_student) is distinct from assignment_before
    or (select count(*) from public.rmc_attendance where student_id=v_student)<>attendance_before
    or (select count(*) from public.rmc_sanctions where student_id=v_student)<>sanctions_before
    or (select count(*) from public.rmc_merit_credits where student_id=v_student)<>credits_before then
    raise exception 'TEST FAILED: designation changed identity, class or ledgers';
  end if;
  if not exists(select 1 from public.rmc_audit where actor_id=v_ssg and target=v_student::text
    and action='assignRole' and data->>'role'='student' and data->>'previous_role'='mayor') then
    raise exception 'TEST FAILED: missing designation audit';
  end if;
  if has_function_privilege('authenticated','app_private.set_student_designation(uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.rmc_command(text,jsonb)','EXECUTE') then
    raise exception 'TEST FAILED: unintended direct function access';
  end if;
end $$;
rollback;
select 'PASS: promotion/demotion, single Mayor, legacy clients, stale/scope guards, revocation, least privilege, freeze/status guards, audit and preserved ledgers' as result;
