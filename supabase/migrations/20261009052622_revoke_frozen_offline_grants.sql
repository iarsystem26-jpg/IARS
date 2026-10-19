begin;

-- Invalidate prepared grants permanently. Unfreezing never re-enables an old
-- roster, so attendance captured during a freeze cannot be submitted later.
create function app_private.expire_frozen_offline_grants() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app_private.offline_attendance_sessions g
    set capture_until = least(g.capture_until, now() - interval '1 second'),
        sync_until = least(g.sync_until, now() - interval '1 second')
    where g.sync_until > now() and (
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
revoke all on function app_private.expire_frozen_offline_grants() from public, anon, authenticated;

create function app_private.expire_offline_grants_on_freeze() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.expire_frozen_offline_grants();
  return new;
end
$$;
revoke all on function app_private.expire_offline_grants_on_freeze() from public, anon, authenticated;
create trigger expire_offline_grants_on_freeze after update of data on public.rmc_settings
for each row when (new.id in ('system_freeze', 'frozen_nodes') and new.data is distinct from old.data)
execute function app_private.expire_offline_grants_on_freeze();

-- Cover units already frozen when this migration is installed.
select app_private.expire_frozen_offline_grants();
commit;
