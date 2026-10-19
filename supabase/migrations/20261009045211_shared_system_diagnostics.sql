-- Browser reports are untrusted diagnostic evidence, separate from security audit events.
create table public.rmc_client_errors (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid(),
  source text not null check (source in ('console.error')),
  message text not null check (length(message) between 1 and 1000),
  details text not null check (length(details) <= 6000),
  route text not null check (length(route) <= 200),
  occurrences integer not null default 1 check (occurrences between 1 and 100),
  occurred_at timestamptz not null default now()
);
create index rmc_client_errors_time_idx on public.rmc_client_errors (occurred_at desc);
create index rmc_client_errors_reporter_idx on public.rmc_client_errors (reporter_id);
alter table public.rmc_client_errors enable row level security;
revoke all on public.rmc_client_errors from anon, authenticated;
grant insert (source, message, details, route, occurrences) on public.rmc_client_errors to authenticated;
grant select on public.rmc_client_errors to authenticated;
grant all on public.rmc_client_errors to service_role;
create policy client_errors_report on public.rmc_client_errors for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy client_errors_health_read on public.rmc_client_errors for select to authenticated
  using ((select app_private.permitted('system.health')));
