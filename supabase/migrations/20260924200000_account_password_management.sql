-- Lets authorized operators reset a managed account without exposing Auth admin
-- credentials to the browser. The Edge Function performs the actual Auth update.
create or replace function public.rmc_change_account_password(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.rmc_profiles := app_private.actor(); target_profile public.rmc_profiles;
begin
  select * into strict target_profile from public.rmc_profiles where id = target for update;
  perform app_private.assert_permission('system.manage_accounts', target_profile.node_id);
  if target_profile.id = actor.id then raise exception 'Use your profile security settings to change your own password.'; end if;
  if target_profile.role_id = 'admin' and actor.role_id <> 'admin' then raise exception 'Only an administrator can manage this account.'; end if;
  insert into public.rmc_audit(actor_id, action, target, data)
  values (actor.id, 'account.password_reset', target::text, jsonb_build_object('target_name', target_profile.profile->>'name'));
end;
$$;
revoke all on function public.rmc_change_account_password(uuid) from public, anon;
grant execute on function public.rmc_change_account_password(uuid) to authenticated;

create or replace function public.rmc_assert_manage_accounts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_permission('system.manage_accounts', null, true);
end;
$$;
revoke all on function public.rmc_assert_manage_accounts() from public, anon;
grant execute on function public.rmc_assert_manage_accounts() to authenticated;
