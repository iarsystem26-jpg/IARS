begin;
-- Authentication links and recipients are AES-GCM encrypted before insertion.
create table public.rmc_auth_email_queue (
 id uuid primary key default extensions.gen_random_uuid(),
 event_key text not null unique,
 payload text not null check(length(payload) < 150000),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '1 hour',
 available_at timestamptz not null default now(),
 attempts smallint not null default 0,
 lease_token uuid,
 leased_until timestamptz,
 status text not null default 'pending' check(status in ('pending','sent','failed','expired')),
 last_error text
);
create index auth_email_ready on public.rmc_auth_email_queue(available_at,created_at) where status = 'pending';
alter table public.rmc_auth_email_queue enable row level security;
revoke all on public.rmc_auth_email_queue from public,anon,authenticated;
grant all on public.rmc_auth_email_queue to service_role;

create function public.rmc_claim_auth_emails() returns setof public.rmc_auth_email_queue
language plpgsql security invoker set search_path = '' as $$
begin
 update public.rmc_auth_email_queue set status = 'expired',payload = '',lease_token = null where status = 'pending' and expires_at <= now();
 -- Retain only delivery counters, never old authentication tokens or recipients.
 delete from public.rmc_auth_email_queue where created_at < now() - interval '7 days';
 return query with ready as (
  select id from public.rmc_auth_email_queue where status = 'pending' and available_at <= now() and expires_at > now()
   and (leased_until is null or leased_until < now()) and attempts < 5
  order by created_at for update skip locked limit 5
 ) update public.rmc_auth_email_queue q set attempts = q.attempts + 1,lease_token = extensions.gen_random_uuid(),leased_until = now() + interval '5 minutes'
 from ready where q.id = ready.id returning q.*;
end $$;
revoke all on function public.rmc_claim_auth_emails() from public,anon,authenticated;
grant execute on function public.rmc_claim_auth_emails() to service_role;

create function public.rmc_ack_auth_email(message_id uuid,lease uuid,delivered boolean) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
 update public.rmc_auth_email_queue set status = case when delivered then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
 payload = case when delivered or attempts >= 5 then '' else payload end,
 available_at = now() + interval '5 minutes',lease_token = null,leased_until = null,
 last_error = case when delivered then null else 'Gmail delivery failed; check Apps Script authorization or quota.' end
 where id = message_id and lease_token = lease and status = 'pending';
 return found;
end $$;
revoke all on function public.rmc_ack_auth_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.rmc_ack_auth_email(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
