begin;
alter table public.rmc_auth_email_queue drop constraint rmc_auth_email_queue_status_check;
alter table public.rmc_auth_email_queue add constraint rmc_auth_email_queue_status_check check(status in ('pending','sent','failed','expired','cancelled','uncertain'));
alter table public.rmc_auth_email_queue add column dedup_key text, add column recipient_key text,
 add column kind text, add column provider_draft_id text, add column provider_message_id text,
 add column sent_at timestamptz;
alter table public.rmc_auth_email_queue alter column expires_at set default now() + interval '7 days';
create unique index auth_email_one_pending on public.rmc_auth_email_queue(dedup_key) where status in ('pending','uncertain') and dedup_key is not null;
create index auth_email_recipient_history on public.rmc_auth_email_queue(recipient_key,created_at desc);

create table public.rmc_email_delivery_state (
 id smallint primary key default 1 check(id=1), safety_limit integer not null default 90,
 provider_limit integer not null default 100, sent_count integer not null default 0,
 reported_sent integer not null default 0, baseline_sent integer not null default 0,
 window_started timestamptz, reset_at timestamptz, blocked_until timestamptz,
 last_heartbeat timestamptz, last_error text,
 duplicates_suppressed integer not null default 0, abuse_suppressed integer not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.rmc_email_delivery_state(id) values(1);
alter table public.rmc_email_delivery_state enable row level security;
revoke all on public.rmc_email_delivery_state from public,anon,authenticated;
grant all on public.rmc_email_delivery_state to service_role;
grant select on public.rmc_email_delivery_state to authenticated;

create function app_private.email_superadmin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_profiles where id=(select auth.uid()) and role_id='admin' and status='active')
 and app_private.session_allowed() and not app_private.access_frozen()
$$;
revoke all on function app_private.email_superadmin() from public,anon;
grant execute on function app_private.email_superadmin() to authenticated;
create policy email_state_superadmin_read on public.rmc_email_delivery_state for select to authenticated using((select app_private.email_superadmin()));
alter publication supabase_realtime add table public.rmc_email_delivery_state;

create function app_private.email_delivery_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; counters jsonb;
begin
 if not app_private.email_superadmin() then raise exception 'Only an active Super Admin can view email delivery statistics.' using errcode='42501'; end if;
 select to_jsonb(s)-'id' into result from public.rmc_email_delivery_state s where id=1;
 select jsonb_build_object('queued',count(*) filter(where status='pending'),
 'sending',count(*) filter(where status='pending' and leased_until>now()),
 'needs_review',count(*) filter(where status='uncertain'),
 'failed',count(*) filter(where status='failed'),
 'sent_today',count(*) filter(where status='sent' and sent_at>now()-interval '24 hours'),
 'oldest_queued_at',min(created_at) filter(where status='pending')) into counters from public.rmc_auth_email_queue;
 return result || counters || jsonb_build_object('server_now',now());
end $$;
revoke all on function app_private.email_delivery_stats() from public,anon;
grant execute on function app_private.email_delivery_stats() to authenticated;
create function public.rmc_email_delivery_stats() returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.email_delivery_stats(); $$;
revoke all on function public.rmc_email_delivery_stats() from public,anon;
grant execute on function public.rmc_email_delivery_stats() to authenticated;

grant usage on schema app_private to service_role;
grant execute on function app_private.consume_budget(text,integer,integer) to service_role;
create function public.rmc_email_request_budget(ip_key text) returns integer language plpgsql security invoker set search_path='' as $$
declare delay integer;
begin
 if ip_key is null or ip_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid email request budget.'; end if;
 delay:=app_private.consume_budget('email:ip:minute:'||ip_key,10,60);
 return greatest(delay,app_private.consume_budget('email:ip:hour:'||ip_key,60,3600));
end $$;
revoke all on function public.rmc_email_request_budget(text) from public,anon,authenticated;
grant execute on function public.rmc_email_request_budget(text) to service_role;

create function public.rmc_enqueue_auth_email(event_id text, message_payload text, dedupe text, recipient text, action_kind text, refreshable boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare delay integer;
begin
 if dedupe is null or recipient is null or dedupe !~ '^[a-f0-9]{64}$' or recipient !~ '^[a-f0-9]{64}$' or length(event_id)>250 then raise exception 'Invalid email queue request.'; end if;
 perform 1 from public.rmc_email_delivery_state where id=1 for update;
 if exists(select 1 from public.rmc_auth_email_queue where event_key=event_id or (dedup_key=dedupe and status in ('pending','uncertain'))) then
  update public.rmc_email_delivery_state set duplicates_suppressed=duplicates_suppressed+1,updated_at=now() where id=1;
  return '{"accepted":true,"duplicate":true}'::jsonb;
 end if;
 if exists(select 1 from public.rmc_auth_email_queue where recipient_key=recipient and kind=action_kind and created_at>now()-interval '2 minutes') then
  update public.rmc_email_delivery_state set abuse_suppressed=abuse_suppressed+1,updated_at=now() where id=1;
  return '{"accepted":true,"suppressed":true}'::jsonb;
 end if;
 delay:=app_private.consume_budget('email:recipient:'||recipient,3,3600);
 if delay>0 then
  update public.rmc_email_delivery_state set abuse_suppressed=abuse_suppressed+1,updated_at=now() where id=1;
  return '{"accepted":true,"suppressed":true}'::jsonb;
 end if;
 if (select count(*) from public.rmc_auth_email_queue where status='pending')>=1000 then
  update public.rmc_email_delivery_state set abuse_suppressed=abuse_suppressed+1,updated_at=now() where id=1;
  return '{"accepted":false,"full":true}'::jsonb;
 end if;
 insert into public.rmc_auth_email_queue(event_key,payload,dedup_key,recipient_key,kind,expires_at)
 values(event_id,message_payload,dedupe,recipient,action_kind,now()+case when refreshable then interval '7 days' else interval '1 hour' end);
 update public.rmc_email_delivery_state set updated_at=now() where id=1;
 return '{"accepted":true,"queued":true}'::jsonb;
end $$;
revoke all on function public.rmc_enqueue_auth_email(text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.rmc_enqueue_auth_email(text,text,text,text,text,boolean) to service_role;

create or replace function public.rmc_claim_auth_emails() returns setof public.rmc_auth_email_queue
language plpgsql security invoker set search_path='' as $$
declare capacity integer; s public.rmc_email_delivery_state;
begin
 select * into s from public.rmc_email_delivery_state where id=1 for update;
 update public.rmc_auth_email_queue set status='expired',payload='',lease_token=null where status='pending' and expires_at<=now();
 -- Uncertain sends are kept for reconciliation, never blindly resent/deleted.
 delete from public.rmc_auth_email_queue where created_at<now()-interval '7 days' and status not in ('pending','uncertain');
 if s.blocked_until>now() or (s.sent_count>=s.safety_limit and s.reset_at>now()) then return; end if;
 capacity:=least(5,s.safety_limit-case when s.reset_at<=now() then 0 else s.sent_count end
 -(select count(*) from public.rmc_auth_email_queue where status='uncertain' or (status='pending' and leased_until>now())));
 if capacity<=0 then return; end if;
 return query with ready as (
  select id from public.rmc_auth_email_queue where status='pending' and available_at<=now() and expires_at>now()
  and (leased_until is null or leased_until<now()) and attempts<100 order by created_at for update skip locked limit capacity
 ) update public.rmc_auth_email_queue q set attempts=q.attempts+1,lease_token=extensions.gen_random_uuid(),leased_until=now()+interval '5 minutes'
 from ready where q.id=ready.id returning q.*;
end $$;

create or replace function public.rmc_ack_auth_email(message_id uuid,lease uuid,delivered boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.rmc_auth_email_queue set status=case when delivered then 'sent' when attempts>=100 then 'failed' else 'pending' end,
 payload=case when delivered or attempts>=100 then '' else payload end,
 sent_at=case when delivered then now() else sent_at end,available_at=now()+interval '5 minutes',lease_token=null,leased_until=null,
 last_error=case when delivered then null else 'Delivery will retry with a fresh link.' end
 where id=message_id and lease_token=lease and status='pending';
 if not found then return false; end if;
 update public.rmc_email_delivery_state s set sent_count=greatest(s.reported_sent,s.baseline_sent+(select count(*) from public.rmc_auth_email_queue where status='sent' and sent_at>=s.window_started)),updated_at=now() where id=1;
 return true;
end $$;

create function public.rmc_email_worker_heartbeat(window_start timestamptz, reported_sent integer, error_code text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare observed_count integer:=reported_sent;
begin
 if reported_sent<0 or reported_sent>10000 or window_start>now()+interval '1 minute' then raise exception 'Invalid worker heartbeat.'; end if;
 update public.rmc_email_delivery_state set
 sent_count=case when window_started is null or (window_start>window_started and reset_at<=now()) then observed_count else greatest(observed_count,baseline_sent+(select count(*) from public.rmc_auth_email_queue where status='sent' and sent_at>=window_started)) end,
 baseline_sent=case when window_started is null or (window_start>window_started and reset_at<=now()) then greatest(0,observed_count-(select count(*) from public.rmc_auth_email_queue where status='sent' and sent_at>=window_start)) else baseline_sent end,
 reported_sent=observed_count,
 window_started=case when window_started is null or (window_start>window_started and reset_at<=now()) then window_start else window_started end,
 reset_at=case when window_started is null or (window_start>window_started and reset_at<=now()) then window_start+interval '24 hours' else reset_at end,
 blocked_until=case when error_code='quota' then greatest(now()+interval '1 hour',coalesce(reset_at,now()+interval '1 hour')) when blocked_until<=now() then null else blocked_until end,
 last_error=case when error_code='quota' then 'Google quota reached; waiting for the next allowance.' when error_code='provider' then 'Gmail delivery is unavailable; retrying.' when error_code='uncertain' then 'A send needs reconciliation; duplicate delivery is prevented.' else null end,
 last_heartbeat=now(),updated_at=now() where id=1;
end $$;
revoke all on function public.rmc_email_worker_heartbeat(timestamptz,integer,text) from public,anon,authenticated;
grant execute on function public.rmc_email_worker_heartbeat(timestamptz,integer,text) to service_role;

create function public.rmc_reconcile_auth_email(message_id uuid,provider_id text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.rmc_auth_email_queue set status='sent',sent_at=now(),payload='',provider_message_id=provider_id,last_error=null
 where id=message_id and status='uncertain';
 if not found then return false; end if;
 update public.rmc_email_delivery_state s set sent_count=greatest(s.reported_sent,s.baseline_sent+(select count(*) from public.rmc_auth_email_queue where status='sent' and sent_at>=s.window_started)),updated_at=now() where id=1;
 return true;
end $$;
revoke all on function public.rmc_reconcile_auth_email(uuid,text) from public,anon,authenticated;
grant execute on function public.rmc_reconcile_auth_email(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
