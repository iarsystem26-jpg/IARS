-- Student/Mayor designation is a scoped student-management operation. General
-- access-role assignments continue to require system.manage_rbac.
update public.rmc_roles
set data = jsonb_set(data, '{permissions}', coalesce(data->'permissions', '[]'::jsonb)
    || '["directory.change_member_designation"]'::jsonb)
    || jsonb_build_object('updatedAt', extract(epoch from clock_timestamp()) * 1000)
where id = 'ssg' and data->>'isBuiltIn' = 'true'
  and not coalesce((data->>'isPositionOnly')::boolean, false)
  and data->'permissions' ? 'directory.manage_members'
  and not (data->'permissions' ? 'directory.change_member_designation');

-- This helper runs only through the existing privileged command gateway; it is
-- not a directly callable authenticated endpoint and needs no definer privilege.
create or replace function app_private.set_student_designation(
  student_id uuid, designation text, expected_node text default null,
  audit_action text default 'assignRole'
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  a public.rmc_profiles := app_private.actor();
  p public.rmc_profiles;
  class_id text;
  class_name text;
  previous_role text;
  displaced_ids uuid[];
  next_profile jsonb;
begin
  if a.id is null or app_private.access_frozen() then
    raise exception 'An active, unfrozen authenticated account is required.' using errcode = '42501';
  end if;
  if designation is null or designation not in ('student', 'mayor') then
    raise exception 'Choose Student or Mayor.' using errcode = '22023';
  end if;
  if audit_action = 'assignSectionMayor' and nullif(expected_node, '') is null then
    raise exception 'Choose the student''s current class.' using errcode = '22023';
  end if;

  select node_id into class_id from public.rmc_profiles where id = student_id;
  if class_id is null then
    raise exception 'Choose an enrolled student with an assigned class.' using errcode = '22023';
  end if;
  perform app_private.assert_permission('directory.change_member_designation', class_id);
  if nullif(expected_node, '') is not null and expected_node is distinct from class_id then
    raise exception 'Student assignment changed. Refresh the class roster.' using errcode = '40001';
  end if;

  -- Use the existing class lock for both promotion and demotion. Lock affected
  -- profiles in UUID order so concurrent appointments cannot create two mayors.
  perform n.id from public.rmc_nodes n where n.id = any(app_private.path(class_id))
    order by n.id for share;
  select data->>'name' into class_name from public.rmc_nodes
    where id = class_id and data->>'type' in ('section', 'block');
  if class_name is null then
    raise exception 'Choose a section or block.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('mayor:' || class_id));
  perform id from public.rmc_profiles
    where id = student_id or (node_id = class_id and role_id = 'mayor' and status = 'active')
    order by id for update;
  select * into strict p from public.rmc_profiles where id = student_id;
  if p.node_id is distinct from class_id then
    raise exception 'Student assignment changed. Refresh the class roster.' using errcode = '40001';
  end if;
  perform app_private.assert_permission('directory.change_member_designation', class_id);
  if app_private.access_frozen() then
    raise exception 'An active, unfrozen authenticated account is required.' using errcode = '42501';
  end if;
  if p.status <> 'active' or p.role_id not in ('student', 'mayor') then
    raise exception 'Choose an active Student or Mayor.' using errcode = '42501';
  end if;
  if exists(select 1 from public.rmc_account_freezes where account_id = p.id) then
    raise exception 'This student account is frozen.' using errcode = '42501';
  end if;
  previous_role := p.role_id;
  if designation = 'mayor' then
    select coalesce(array_agg(id order by id), '{}'::uuid[]) into displaced_ids
      from public.rmc_profiles where node_id = class_id and role_id = 'mayor'
        and status = 'active' and id <> student_id;
    if exists(select 1 from public.rmc_account_freezes where account_id = any(displaced_ids)) then
      raise exception 'The current Mayor account is frozen.' using errcode = '42501';
    end if;
    update public.rmc_profiles
      set role_id = 'student', profile = app_private.assign_profile(
        (profile - 'official_data') || '{"role":"student"}'::jsonb, class_id, false)
      where id = any(displaced_ids);
    next_profile := app_private.assign_profile(p.profile || '{"role":"mayor"}'::jsonb, class_id, true);
    next_profile := jsonb_set(next_profile, '{official_data}', next_profile->'official_data'
      || jsonb_build_object('body', 'SSG', 'position', 'Mayor', 'scope', class_name));
  else
    displaced_ids := '{}'::uuid[];
    next_profile := app_private.assign_profile(
      (p.profile - 'official_data') || '{"role":"student"}'::jsonb, class_id, false);
  end if;
  update public.rmc_profiles set role_id = designation, profile = next_profile where id = student_id;
  insert into public.rmc_audit(actor_id, action, target, data)
    values(a.id, audit_action, student_id::text, jsonb_build_object(
      'actor_name', a.profile->>'name', 'target_name', p.profile->>'name',
      'previous_role', previous_role, 'role', designation, 'scope_node_id', class_id,
      'displaced_mayor_ids', to_jsonb(displaced_ids)));
  return 'true'::jsonb;
end;
$$;
revoke all on function app_private.set_student_designation(uuid, text, text, text)
  from public, anon, authenticated;

-- Keep the public RPC and all unrelated command branches intact. The guarded
-- patch deliberately fails on an unexpected gateway definition.
do $$
declare definition text;
begin
  definition := replace(pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('-- Scoped Student/Mayor designation gateway.' in definition) > 0 then return; end if;
  if position(E'\n case\n' in definition) = 0
    or position('when action in (''assignSectionMayor'',''assignRole'',''assignAccountRole'',''assignOfficialToNode'') then' in definition) = 0 then
    raise exception 'Unexpected command gateway. Review before applying the designation fix.';
  end if;
  definition := replace(definition, E'\n case\n', E'\n'
    || ' -- Scoped Student/Mayor designation gateway.' || E'\n'
    || ' if action = ''assignSectionMayor'' then' || E'\n'
    || '  return app_private.set_student_designation((args->>0)::uuid, ''mayor'', args->>1, action);' || E'\n'
    || ' elsif action = ''assignRole'' and args->>1 in (''student'', ''mayor'') then' || E'\n'
    || '  return app_private.set_student_designation((args->>0)::uuid, args->>1, args->>2, action);' || E'\n'
    || ' end if;' || E'\n case\n');
  execute definition;
end;
$$;
notify pgrst, 'reload schema';
