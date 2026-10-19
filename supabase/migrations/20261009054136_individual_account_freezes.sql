begin;

-- Rows represent direct freezes only. Clients cannot insert, edit, or delete them.
create table public.rmc_account_freezes (
  account_id uuid primary key references public.rmc_profiles(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  frozen_at timestamptz not null default now(),
  frozen_by uuid references public.rmc_profiles(id) on delete set null,
  frozen_by_name text
);
alter table public.rmc_account_freezes enable row level security;
revoke all on public.rmc_account_freezes from public, anon, authenticated;
grant select on public.rmc_account_freezes to authenticated;
grant all on public.rmc_account_freezes to service_role;

create or replace function app_private.access_frozen() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.rmc_account_freezes where account_id = (select auth.uid()))
    or coalesce((select p.role_id <> 'admin' and (
      app_private.frozen(p.node_id)
      or app_private.frozen(p.profile #>> '{school_data,academic_assignment,terminalGroupId}')
      or app_private.frozen(p.profile #>> '{official_data,assignment_node_id}')
    ) from public.rmc_profiles p where p.id = (select auth.uid()) and p.status = 'active'), false)
$$;

create policy account_freeze_read on public.rmc_account_freezes for select to authenticated using (
  account_id = (select auth.uid()) or (
    not (select app_private.access_frozen())
    and (select (app_private.actor()).role_id) = 'admin'
    and (select app_private.permitted('system.freeze'))
  )
);

create or replace function app_private.frozen_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.rmc_profiles;
  ancestry text[];
  nodes jsonb;
  settings jsonb;
begin
  select * into actor from public.rmc_profiles where id = (select auth.uid());
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

-- Always overlay the authoritative freeze record, never trust profile JSON.
create or replace function public.rmc_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare snapshot jsonb; profiles jsonb;
begin
  snapshot := case when app_private.access_frozen()
    then app_private.frozen_snapshot() else app_private.full_snapshot() end;
  select coalesce(jsonb_agg(person || jsonb_build_object('account_freeze', (
    select jsonb_build_object('isFrozen', true, 'reason', f.reason,
      'frozenAt', extract(epoch from f.frozen_at)*1000, 'frozenBy', f.frozen_by_name)
    from public.rmc_account_freezes f where f.account_id::text = person->>'uid'
  ))), '[]'::jsonb) into profiles from jsonb_array_elements(snapshot->'profiles') person;
  return jsonb_set(snapshot, '{profiles}', profiles);
end
$$;
revoke all on function public.rmc_snapshot() from public, anon;
grant execute on function public.rmc_snapshot() to authenticated;

create function app_private.set_account_freezes(target_ids uuid[], frozen boolean, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.rmc_profiles; ids uuid[]; target public.rmc_profiles; changed integer := 0;
begin
  if frozen is null or target_ids is null or cardinality(target_ids) not between 1 and 200
    or array_position(target_ids, null) is not null then
    raise exception 'Select between 1 and 200 valid accounts.' using errcode = '22023';
  end if;
  if length(coalesce(reason, '')) > 2000 or (frozen and length(btrim(coalesce(reason, ''))) = 0) then
    raise exception 'Enter a freeze reason of up to 2000 characters.' using errcode = '22023';
  end if;
  select array_agg(distinct id) into ids from unnest(target_ids) id;
  -- Serialize batches and recheck authorization after waiting for concurrent changes.
  perform pg_advisory_xact_lock(hashtextextended('rmc_account_freezes', 0));
  perform 1 from public.rmc_profiles where id = any(ids) or role_id = 'admin' order by id for update;
  a := app_private.actor();
  if a.id is null or a.role_id <> 'admin' or app_private.access_frozen() then
    raise exception 'An unfrozen active admin account is required.' using errcode = '42501';
  end if;
  perform app_private.assert_permission('system.freeze', null, true);
  if (select count(*) from public.rmc_profiles where id = any(ids)) <> cardinality(ids) then
    raise exception 'One or more accounts no longer exist. No accounts were changed.' using errcode = '22023';
  end if;
  if frozen and not exists(
    select 1 from public.rmc_profiles p where p.role_id = 'admin' and p.status = 'active'
      and not (p.id = any(ids))
      and not exists(select 1 from public.rmc_account_freezes f where f.account_id = p.id)
  ) then
    raise exception 'Keep at least one active admin unfrozen to restore access.' using errcode = '22023';
  end if;
  if frozen then
    insert into public.rmc_account_freezes(account_id, reason, frozen_at, frozen_by, frozen_by_name)
      select id, btrim(reason), now(), a.id, a.profile->>'name' from unnest(ids) id
      on conflict (account_id) do update set reason = excluded.reason, frozen_at = excluded.frozen_at,
        frozen_by = excluded.frozen_by, frozen_by_name = excluded.frozen_by_name;
  else
    delete from public.rmc_account_freezes where account_id = any(ids);
  end if;
  get diagnostics changed = row_count;
  for target in select * from public.rmc_profiles where id = any(ids) loop
    insert into public.rmc_audit(actor_id, action, target, data)
      values(a.id, case when frozen then 'freezeAccount' else 'unfreezeAccount' end, target.id::text,
        jsonb_build_object('actor_name', a.profile->>'name', 'target_name', target.profile->>'name',
          'reason', btrim(coalesce(reason, '')), 'account_freeze', frozen));
  end loop;
  return jsonb_build_object('count', changed, 'ids', ids, 'isFrozen', frozen);
end
$$;
revoke all on function app_private.set_account_freezes(uuid[], boolean, text) from public, anon;
grant execute on function app_private.set_account_freezes(uuid[], boolean, text) to authenticated;

create function public.rmc_set_account_freezes(target_ids uuid[], frozen boolean, reason text default '')
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.set_account_freezes(target_ids, frozen, reason)
$$;
revoke all on function public.rmc_set_account_freezes(uuid[], boolean, text) from public, anon;
grant execute on function public.rmc_set_account_freezes(uuid[], boolean, text) to authenticated;

create or replace function app_private.expire_frozen_offline_grants() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app_private.offline_attendance_sessions g
    set capture_until = least(g.capture_until, now() - interval '1 second'),
        sync_until = least(g.sync_until, now() - interval '1 second')
    where g.sync_until > now() and (
      exists(select 1 from public.rmc_account_freezes f where f.account_id = g.actor_id)
      or exists(select 1 from jsonb_array_elements(g.roster) r
        join public.rmc_account_freezes f on f.account_id::text = r->>'uid')
      or
      exists(select 1 from public.rmc_profiles p where p.id = g.actor_id
        and p.role_id <> 'admin' and (
          app_private.frozen(p.node_id)
          or app_private.frozen(p.profile #>> '{school_data,academic_assignment,terminalGroupId}')
          or app_private.frozen(p.profile #>> '{official_data,assignment_node_id}')))
      or exists(select 1 from public.rmc_events e where e.id = g.event_id and app_private.frozen(e.node_id))
      or exists(select 1 from jsonb_array_elements(g.roster) r
        join public.rmc_profiles p on p.id::text = r->>'uid' where app_private.frozen(p.node_id))
    );
end
$$;
create trigger expire_offline_grants_on_account_freeze
after insert or update on public.rmc_account_freezes for each statement
execute function app_private.expire_offline_grants_on_freeze();

notify pgrst, 'reload schema';
commit;
