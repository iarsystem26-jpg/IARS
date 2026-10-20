-- Provisioning registry contains setup contacts, never institution records or backend secrets.
create table public.rmc_institutions (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
 config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) < 12000),
 status text not null default 'queued' check (status in ('queued','creating','migrating','configuring','verifying','active','failed')),
 stage text not null default 'Waiting for provisioning worker',
 project_ref text unique check (project_ref ~ '^[a-z]{20}$'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 lease_until timestamptz,
 lease_token uuid,
 bootstrap_url text,
 error text
);
create index rmc_institutions_queue_idx on public.rmc_institutions(created_at) where status <> 'active';
alter table public.rmc_institutions enable row level security;
revoke all on public.rmc_institutions from public, anon, authenticated;
grant select, insert on public.rmc_institutions to authenticated;
grant update(status,config) on public.rmc_institutions to authenticated;
grant all on public.rmc_institutions to service_role;
create policy institution_admin_read on public.rmc_institutions for select to authenticated
 using (exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen());
create policy institution_admin_create on public.rmc_institutions for insert to authenticated
 with check (created_by=(select auth.uid()) and status='queued' and project_ref is null and lease_until is null and lease_token is null and bootstrap_url is null and error is null
 and exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen());
create policy institution_admin_retry on public.rmc_institutions for update to authenticated
 using (status in ('failed','active') and lease_token is null and exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen())
 with check (status='queued' and lease_token is null and exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen());

create table public.rmc_institution_routes (
 slug text primary key references public.rmc_institutions(slug),
 project_ref text not null unique check (project_ref ~ '^[a-z]{20}$'),
 publishable_key text not null check (length(publishable_key) between 20 and 500)
);
alter table public.rmc_institution_routes enable row level security;
revoke all on public.rmc_institution_routes from public, anon, authenticated;
grant select on public.rmc_institution_routes to anon,authenticated;
grant all on public.rmc_institution_routes to service_role;
create policy institution_published_routes on public.rmc_institution_routes for select to anon,authenticated using(true);

-- One verified identity per physical institution project. No client can change its binding.
create table public.rmc_institution_branding (
 id boolean primary key default true check(id),
 config jsonb not null check (jsonb_typeof(config)='object' and octet_length(config::text)<12000)
);
alter table public.rmc_institution_branding enable row level security;
revoke all on public.rmc_institution_branding from public,anon,authenticated;
grant select on public.rmc_institution_branding to anon,authenticated;
grant all on public.rmc_institution_branding to service_role;
create policy institution_public_branding on public.rmc_institution_branding for select to anon,authenticated using(true);

-- Logos are public by design. Only active administrators can upload a new immutable object.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('institution-logos','institution-logos',true,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy institution_logo_insert on storage.objects for insert to authenticated with check (
 bucket_id='institution-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen());
create policy institution_logo_delete on storage.objects for delete to authenticated using (
 bucket_id='institution-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active') and app_private.session_allowed() and not app_private.access_frozen());
