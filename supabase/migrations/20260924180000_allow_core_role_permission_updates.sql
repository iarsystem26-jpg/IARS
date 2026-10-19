-- Allow an authorized administrator to customize built-in role access, including
-- the system owner role. The existing command intentionally protects the admin
-- role from deletion and account reassignment; that protection should not also
-- prevent updating its permission definition.
create or replace function public.rmc_update_core_role(target text, changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.rmc_profiles := app_private.actor();
  result jsonb;
begin
  perform app_private.assert_permission('system.manage_rbac', null, true);

  if target is null or target = '' then
    raise exception 'A core role is required.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.rmc_roles
    where id = target and data->>'isBuiltIn' = 'true'
  ) then
    raise exception 'Core role not found.' using errcode = 'P0002';
  end if;

  -- Identity and provenance remain server controlled. Only editable role
  -- metadata and permissions may be supplied by the client.
  update public.rmc_roles
  set data = data
    || (coalesce(changes, '{}'::jsonb) - 'id' - 'isBuiltIn' - 'createdBy' - 'createdAt')
    || jsonb_build_object('id', target, 'isBuiltIn', true, 'updatedAt', extract(epoch from clock_timestamp()) * 1000)
  where id = target
  returning data into result;

  insert into public.rmc_audit(actor_id, action, target, data)
  values (actor.id, 'updateCoreRole', target, jsonb_build_object('actor_name', actor.profile->>'name', 'target_name', target));

  return result;
end;
$$;

revoke all on function public.rmc_update_core_role(text, jsonb) from public;
grant execute on function public.rmc_update_core_role(text, jsonb) to authenticated;
