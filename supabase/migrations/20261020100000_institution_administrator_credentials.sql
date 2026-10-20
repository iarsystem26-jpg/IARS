-- Initial passwords are transient worker input, never readable by browser clients.
create table public.rmc_institution_credentials (
 institution_id uuid primary key references public.rmc_institutions(id) on delete cascade,
 initial_password text not null check (length(initial_password) between 12 and 1024),
 created_at timestamptz not null default now()
);
alter table public.rmc_institution_credentials enable row level security;
revoke all on public.rmc_institution_credentials from public, anon, authenticated;
grant all on public.rmc_institution_credentials to service_role;
alter table public.rmc_institutions add column admin_email_queued_at timestamptz;

create function public.rmc_create_institution(setup_config jsonb, initial_password text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare institution_id uuid;
begin
 if not exists(select 1 from public.rmc_profiles where id=auth.uid() and role_id='admin' and status='active')
    or not app_private.session_allowed() or app_private.access_frozen() then
   raise exception 'Administrator access required';
 end if;
 if initial_password is null or length(initial_password) not between 12 and 1024
    or initial_password !~ '[A-Z]' or initial_password !~ '[0-9]' or initial_password !~ '[^A-Za-z0-9]' then
   raise exception 'Password must meet all strength requirements';
 end if;
 -- Explicitly strip credential-shaped fields from any client-provided JSON.
 setup_config := setup_config - 'password' - 'adminPassword' - 'initial_password';
 insert into public.rmc_institutions(slug, config, created_by)
 values(setup_config->>'slug', setup_config, auth.uid()) returning id into institution_id;
 insert into public.rmc_institution_credentials(institution_id, initial_password)
 values(institution_id, initial_password);
 return institution_id;
end;
$$;
revoke all on function public.rmc_create_institution(jsonb,text) from public,anon;
grant execute on function public.rmc_create_institution(jsonb,text) to authenticated;
-- Creation must commit the credential and request together.
revoke insert on public.rmc_institutions from authenticated;
