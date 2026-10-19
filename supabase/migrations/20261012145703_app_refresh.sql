begin;

-- This singleton contains no identity or private application data.
create table public.rmc_app_release (
  id smallint primary key check (id = 1),
  revision uuid not null default extensions.gen_random_uuid(),
  updated_at timestamptz not null default now()
);
insert into public.rmc_app_release(id) values (1);
alter table public.rmc_app_release enable row level security;
revoke all on public.rmc_app_release from public, anon, authenticated;
grant select on public.rmc_app_release to anon, authenticated;
create policy app_release_read on public.rmc_app_release for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.rmc_app_release;

create function app_private.initiate_app_refresh(confirmation text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  claims jsonb := (select auth.jwt());
  next_revision uuid;
  needs_mfa boolean;
begin
  if actor is null or not exists (
    select 1 from public.rmc_profiles where id = actor and role_id = 'admin' and status = 'active'
  ) or not app_private.session_allowed() or app_private.access_frozen() then
    raise exception 'Only an active administrator can initiate an app refresh.' using errcode = '42501';
  end if;
  if confirmation is distinct from 'initiate' then
    raise exception 'Type initiate exactly to confirm.' using errcode = '22023';
  end if;
  -- Signed Auth claims prove a new password login, not just a refreshed access token.
  if not exists (select 1 from jsonb_array_elements(coalesce(claims->'amr', '[]')) factor
    where factor->>'method' = 'password'
      and (factor->>'timestamp')::numeric between extract(epoch from now()) - 120 and extract(epoch from now()) + 10)
    or not exists (select 1 from auth.sessions where id::text = claims->>'session_id'
      and user_id = actor and (not_after is null or not_after > now())) then
    raise exception 'Verify your current password again before initiating a refresh.' using errcode = '42501';
  end if;
  select exists(select 1 from auth.mfa_factors where user_id = actor and status = 'verified') into needs_mfa;
  if needs_mfa and (claims->>'aal' is distinct from 'aal2' or not exists (
    select 1 from jsonb_array_elements(coalesce(claims->'amr', '[]')) factor
    where factor->>'method' in ('totp', 'mfa/totp', 'mfa/phone', 'phone')
      and (factor->>'timestamp')::numeric between extract(epoch from now()) - 120 and extract(epoch from now()) + 10
  )) then
    raise exception 'Verify your current two-factor code again.' using errcode = '42501';
  end if;
  -- Serialize the singleton update and limit accidental repeated global reloads.
  perform 1 from public.rmc_app_release where id = 1 for update;
  if exists(select 1 from public.rmc_audit where action = 'app.refresh_initiated' and created_at > now() - interval '30 seconds') then
    raise exception 'A refresh was just initiated. Wait 30 seconds before trying again.' using errcode = '22023';
  end if;
  update public.rmc_app_release set revision = extensions.gen_random_uuid(), updated_at = now()
    where id = 1 returning revision into next_revision;
  insert into public.rmc_audit(actor_id, action, target, data)
    values(actor, 'app.refresh_initiated', 'all-clients', jsonb_build_object('revision', next_revision));
  return next_revision;
end;
$$;
revoke all on function app_private.initiate_app_refresh(text) from public, anon, authenticated;
grant execute on function app_private.initiate_app_refresh(text) to authenticated;

create function public.rmc_initiate_app_refresh(confirmation text) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.initiate_app_refresh(confirmation);
$$;
revoke all on function public.rmc_initiate_app_refresh(text) from public, anon;
grant execute on function public.rmc_initiate_app_refresh(text) to authenticated;
notify pgrst, 'reload schema';
commit;
