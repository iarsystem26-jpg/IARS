begin;

create table app_private.request_budgets (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create index request_budgets_expiry on app_private.request_budgets(window_start);
alter table app_private.request_budgets enable row level security;
revoke all on app_private.request_budgets from public, anon, authenticated;

-- Atomic, bounded counters shared by all function instances. Returning a delay
-- (rather than raising) commits attempts even when the Edge request fails later.
create function app_private.consume_budget(bucket_key text, maximum integer, seconds integer)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare n integer; started timestamptz; moment timestamptz := clock_timestamp();
begin
  insert into app_private.request_budgets as b values (bucket_key, moment, 1)
  on conflict (bucket) do update set
    attempts = case when b.window_start + make_interval(secs => seconds) <= moment then 1 else least(b.attempts + 1, maximum + 1) end,
    window_start = case when b.window_start + make_interval(secs => seconds) <= moment then moment else b.window_start end
  returning attempts, window_start into n, started;
  if n > maximum then return greatest(1, ceil(extract(epoch from started + make_interval(secs => seconds) - moment))::integer); end if;
  return 0;
end $$;
revoke all on function app_private.consume_budget(text,integer,integer) from public, anon, authenticated;

create function public.rmc_edge_rate_limit(route_name text, subject_hash text, authenticated_actor boolean default false)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare maximum integer;
begin
  if subject_hash !~ '^[a-f0-9]{64}$' or subject_hash is null or authenticated_actor is null then raise exception 'Invalid rate limit subject'; end if;
  maximum := case route_name
    when 'login' then 300 when 'enroll' then 120
    when 'accounts' then case when authenticated_actor then 30 else 600 end
    when 'scanner-photo' then case when authenticated_actor then 600 else 6000 end
    else null end;
  if maximum is null then raise exception 'Unknown rate limit route'; end if;
  return app_private.consume_budget('edge:' || route_name || ':' || authenticated_actor::text || ':' || subject_hash, maximum, 60);
end $$;
revoke all on function public.rmc_edge_rate_limit(text,text,boolean) from public, anon, authenticated;
grant execute on function public.rmc_edge_rate_limit(text,text,boolean) to service_role;

-- The application calls these reads with POST. VOLATILE lets the pre-request
-- hook persist its counter; PostgREST rejects GET calls to these RPCs instead
-- of allowing a read-only transaction to bypass the budget.
alter function public.rmc_snapshot() volatile;
alter function public.rmc_public_organizations() volatile;

-- Preserve the existing freeze hook. GET/HEAD and STABLE RPCs are read-only
-- transactions and cannot update counters. These need gateway protection.
create function app_private.enforce_request_budget() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); role_name text := auth.jwt()->>'role'; key text; retry integer;
begin
  perform app_private.enforce_freeze();
  if coalesce(current_setting('request.method', true), '') not in ('POST','PUT','PATCH','DELETE')
    or current_setting('transaction_read_only') = 'on' or role_name = 'service_role' then return; end if;
  if role_name = 'authenticated' and actor is not null then
    key := 'api:user:' || actor::text;
    retry := app_private.consume_budget(key, 600, 60);
  else
    key := 'api:ip:' || encode(extensions.digest(coalesce(nullif(trim(split_part(
      coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-forwarded-for', ',', 1)), ''), 'unknown'), 'sha256'), 'hex');
    retry := app_private.consume_budget(key, 300, 60);
  end if;
  if retry > 0 then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object('code','RATE_LIMITED','message','Too many requests. Please wait before trying again.','details',null,'hint',null)::text,
      detail = jsonb_build_object('status',429,'headers',jsonb_build_object('Retry-After',retry::text))::text;
  end if;
end $$;
revoke all on function app_private.enforce_request_budget() from public;
grant execute on function app_private.enforce_request_budget() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'app_private.enforce_request_budget';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

select cron.schedule('rmc-request-budget-retention', '17 * * * *',
  $job$delete from app_private.request_budgets where window_start < now() - interval '2 hours'$job$);

commit;
