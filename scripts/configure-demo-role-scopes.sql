-- User-selected demo setup: SSG at College Department; Mayor and Student at 1SP - A.
-- Only reserved demo identities can be changed. All three assignments are atomic.
begin;
do $$
declare
  v_owner uuid; v_ssg public.rmc_profiles; v_mayor public.rmc_profiles; v_student public.rmc_profiles;
  v_scope text := 'college_1789869610851'; v_class text := 'block_1789870005656';
  v_identity jsonb; v_balances jsonb;
begin
  select id into strict v_owner from public.rmc_profiles where is_test_account and role_id='admin'
    and status='active' and profile->>'username'='admin';
  select * into strict v_ssg from public.rmc_profiles where is_test_account and role_id='ssg'
    and status='active' and profile->>'username'='ssg' for update;
  select * into strict v_mayor from public.rmc_profiles where is_test_account and role_id='mayor'
    and status='active' and profile->>'username'='mayor' for update;
  select * into strict v_student from public.rmc_profiles where is_test_account and role_id='student'
    and status='active' and profile->>'username'='student' for update;
  if not exists(select 1 from public.rmc_nodes where id=v_scope and data->>'name'='College Department' and data->>'type'='college')
    or not exists(select 1 from public.rmc_nodes where id=v_class and data->>'name'='1SP - A' and data->>'type'='block')
    or not (v_scope=any(app_private.path(v_class))) then
    raise exception 'The selected College Department / 1SP - A hierarchy changed. Review the demo setup.';
  end if;
  if app_private.frozen(v_scope) or app_private.frozen(v_class) then
    raise exception 'The selected demo scope is frozen.';
  end if;
  if (v_ssg.node_id is not null and v_ssg.node_id<>v_scope)
    or (v_mayor.node_id is not null and v_mayor.node_id<>v_class)
    or (v_student.node_id is not null and v_student.node_id<>v_class) then
    raise exception 'A demo account was assigned elsewhere. Review before moving it.';
  end if;
  perform pg_advisory_xact_lock(hashtext('mayor:'||v_class));
  if exists(select 1 from public.rmc_profiles where node_id=v_class and role_id='mayor' and status='active' and id<>v_mayor.id) then
    raise exception '1SP - A already has another Mayor. Its account will not be displaced.';
  end if;
  select jsonb_object_agg(id::text,profile-array['school_data','official_data']) into v_identity
    from public.rmc_profiles where id in (v_ssg.id,v_mayor.id,v_student.id);
  select jsonb_object_agg(id::text,app_private.balance(id)) into v_balances
    from public.rmc_profiles where id in (v_ssg.id,v_mayor.id,v_student.id);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal2')::text,true);
  if v_ssg.node_id is distinct from v_scope then
    perform public.rmc_command('assignOfficialToNode',jsonb_build_array(v_owner,v_ssg.id,v_scope));
  end if;
  if v_mayor.node_id is distinct from v_class then
    perform public.rmc_command('assignOfficialToNode',jsonb_build_array(v_owner,v_mayor.id,v_class));
  end if;
  if v_student.node_id is distinct from v_class then
    perform public.rmc_transfer_students(jsonb_build_array(jsonb_build_object(
      'uid',v_student.id,'student_id',v_student.profile->>'student_id',
      'source_node_id',coalesce(v_student.node_id,''),'destination_node_id',v_class)));
  end if;
  if (select jsonb_object_agg(id::text,profile-array['school_data','official_data']) from public.rmc_profiles where id in (v_ssg.id,v_mayor.id,v_student.id)) is distinct from v_identity
    or (select jsonb_object_agg(id::text,app_private.balance(id)) from public.rmc_profiles where id in (v_ssg.id,v_mayor.id,v_student.id)) is distinct from v_balances then
    raise exception 'Demo assignment changed identity, role or sanction balance.';
  end if;
  if (select node_id from public.rmc_profiles where id=v_ssg.id)<>v_scope
    or (select node_id from public.rmc_profiles where id=v_mayor.id)<>v_class
    or (select node_id from public.rmc_profiles where id=v_student.id)<>v_class then
    raise exception 'Demo assignment did not persist correctly.';
  end if;
end;
$$;
commit;
select profile->>'username' as account,role_id,node_id,profile#>>'{school_data,section}' as class,
  profile#>>'{school_data,department}' as department
from public.rmc_profiles where is_test_account and profile->>'username' in ('ssg','mayor','student') order by role_id;
