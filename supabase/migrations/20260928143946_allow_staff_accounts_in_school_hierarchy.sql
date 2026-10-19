-- Staff scope is defined by an existing hierarchy node, not its display type.
-- Schools may use education_unit/college roots instead of a campus node.
create or replace function app_private.provision_check(person jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.rmc_profiles := app_private.actor();
  assignment text := coalesce(person#>>'{official_data,assignment_node_id}', person#>>'{school_data,academic_assignment,terminalGroupId}');
  requested_role text := coalesce(person->>'role', 'student');
  kind text;
begin
  if actor.id is null then
    raise exception 'An active authenticated account is required.' using errcode = '42501';
  end if;
  if requested_role = 'admin' then
    if actor.role_id <> 'admin' then
      raise exception 'Only an administrator can create administrator accounts.';
    end if;
    perform app_private.assert_permission('system.manage_accounts', null, true);
  elsif requested_role in ('ossa', 'ossa_staff', 'ssg') then
    perform app_private.assert_permission('system.manage_accounts', assignment);
  else
    perform app_private.assert_permission('directory.manage_members', assignment);
  end if;
  if requested_role not in ('student', 'mayor', 'ssg', 'ossa', 'ossa_staff', 'admin') then
    raise exception 'Invalid account role.';
  end if;
  if requested_role in ('ossa', 'ossa_staff') and actor.role_id <> 'admin' then
    raise exception 'You cannot create an account with this level of access.';
  end if;
  if actor.role_id = 'ssg' and requested_role = 'ssg' then
    raise exception 'You cannot create an account with this level of access.';
  end if;
  if requested_role <> 'admin' then
    select data->>'type' into kind from public.rmc_nodes where id = assignment;
    if kind is null then raise exception 'Select a valid academic unit.'; end if;
    if requested_role in ('student', 'mayor') and kind not in ('section', 'block') then
      raise exception 'This role cannot be assigned to this unit.';
    end if;
  end if;
  if coalesce(trim(person->>'name'), '') = '' then raise exception 'Name is required.'; end if;
  if exists (
    select 1 from public.rmc_profiles
    where lower(profile->>'email') = lower(person->>'email')
       or lower(profile->>'username') = lower(person->>'username')
       or lower(profile->>'student_id') = lower(person->>'student_id')
  ) then
    raise exception 'Email, username, or student ID already exists.';
  end if;
  -- assign_profile validates the complete path (including archived ancestors)
  -- and derives the scope on the server. No limit is imposed per role or unit.
  return case when requested_role = 'admin' then person
    else app_private.assign_profile(person, assignment, requested_role <> 'student') end;
end;
$$;
revoke all on function app_private.provision_check(jsonb) from public, anon;
grant execute on function app_private.provision_check(jsonb) to authenticated;
