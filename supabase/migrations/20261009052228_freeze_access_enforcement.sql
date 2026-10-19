begin;

-- Canonical assignments and roles come from the database, never client metadata.
create function app_private.access_frozen() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role_id <> 'admin' and (
    app_private.frozen(p.node_id)
    or app_private.frozen(p.profile #>> '{school_data,academic_assignment,terminalGroupId}')
    or app_private.frozen(p.profile #>> '{official_data,assignment_node_id}')
  ) from public.rmc_profiles p where p.id = (select auth.uid()) and p.status = 'active'), false)
$$;
revoke all on function app_private.access_frozen() from public, anon;
grant execute on function app_private.access_frozen() to authenticated, service_role;

-- This is the only workspace data returned to a frozen account. It intentionally
-- contains no attendance, documents, guardian details, event records or billing.
create function app_private.frozen_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.rmc_profiles;
  ancestry text[];
  nodes jsonb;
  settings jsonb;
begin
  select * into actor from public.rmc_profiles where id = (select auth.uid()) and status = 'active';
  if actor.id is null or not app_private.access_frozen() then
    raise exception 'Frozen status is unavailable for this account.' using errcode = '42501';
  end if;
  ancestry := app_private.path(actor.node_id)
    || app_private.path(actor.profile #>> '{school_data,academic_assignment,terminalGroupId}')
    || app_private.path(actor.profile #>> '{official_data,assignment_node_id}');
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'parent_id', n.parent_id,
    'data', jsonb_build_object('id', n.id, 'name', n.data->>'name', 'type', n.data->>'type'))), '[]')
    into nodes from public.rmc_nodes n where n.id = any(ancestry);
  select jsonb_build_object(
    'system_freeze', coalesce((select data from public.rmc_settings where id = 'system_freeze'), '{"isFrozen":false,"reason":""}'),
    'frozen_nodes', coalesce((select jsonb_object_agg(e.key, e.value)
      from public.rmc_settings s cross join lateral jsonb_each(s.data) e
      where s.id = 'frozen_nodes' and e.key = any(ancestry)), '{}')) into settings;
  return jsonb_build_object(
    'profiles', jsonb_build_array(jsonb_build_object('uid', actor.id, 'role', actor.role_id,
      'account_status', actor.status, 'name', actor.profile->>'name',
      'username', actor.profile->>'username', 'student_id', actor.profile->>'student_id',
      'school_data', jsonb_build_object('academic_assignment', jsonb_build_object(
        'terminalGroupId', coalesce(actor.profile #>> '{school_data,academic_assignment,terminalGroupId}', actor.node_id))),
      'official_data', jsonb_build_object('assignment_node_id', actor.profile #>> '{official_data,assignment_node_id}'))),
    'nodes', nodes, 'settings', settings, 'roles', '{}'::jsonb,
    'applications', '[]'::jsonb, 'events', '[]'::jsonb, 'attendance', '[]'::jsonb,
    'merit_credits', '[]'::jsonb, 'sanctions', '[]'::jsonb, 'excuses', '[]'::jsonb,
    'audit', '[]'::jsonb, 'organizations', '[]'::jsonb,
    'organization_members', '[]'::jsonb, 'organization_sanctions', '[]'::jsonb);
end
$$;
revoke all on function app_private.frozen_snapshot() from public, anon;
grant execute on function app_private.frozen_snapshot() to authenticated;

-- Keep the existing RLS-based snapshot for active accounts in a non-exposed schema.
alter function public.rmc_snapshot() set schema app_private;
alter function app_private.rmc_snapshot() rename to full_snapshot;
revoke all on function app_private.full_snapshot() from public, anon;
grant execute on function app_private.full_snapshot() to authenticated;
create function public.rmc_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when app_private.access_frozen()
    then app_private.frozen_snapshot() else app_private.full_snapshot() end
$$;
revoke all on function public.rmc_snapshot() from public, anon;
grant execute on function public.rmc_snapshot() to authenticated;

-- Restrictive policies also cover Realtime and Storage, which do not run the
-- PostgREST pre-request hook. Existing permissive authorization still applies.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'rmc_profiles', 'rmc_roles', 'rmc_applications', 'rmc_events',
    'rmc_attendance', 'rmc_merit_credits', 'rmc_sanctions', 'rmc_excuses',
    'rmc_settings', 'rmc_audit', 'rmc_notifications', 'rmc_organizations',
    'rmc_organization_members', 'rmc_organization_sanctions', 'rmc_profile_requests',
    'rmc_client_errors'
  ] loop
    execute format('create policy freeze_access_guard on public.%I as restrictive for all to authenticated
      using (not (select app_private.access_frozen()))
      with check (not (select app_private.access_frozen()))', table_name);
  end loop;
end $$;
create policy freeze_document_guard on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'rmc-documents' or not (select app_private.access_frozen()))
with check (bucket_id <> 'rmc-documents' or not (select app_private.access_frozen()));

-- Reject direct table queries and every other RPC, including SECURITY DEFINER
-- entry points, before they execute. Only the safe status snapshot is allowed.
create function app_private.enforce_freeze() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.jwt()->>'role') = 'authenticated' and app_private.access_frozen()
    and ltrim(coalesce(current_setting('request.path', true), ''), '/') <> 'rpc/rmc_snapshot' then
    raise exception 'Access is frozen by school administration.' using errcode = '42501';
  end if;
end
$$;
revoke all on function app_private.enforce_freeze() from public;
grant execute on function app_private.enforce_freeze() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'app_private.enforce_freeze';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
