create table app_private.enrollment_attempts (key text primary key, window_start timestamptz not null, attempts integer not null check (attempts > 0));
create table app_private.enrollment_tickets (email_hash text primary key, ticket_hash text not null, expires_at timestamptz not null);
alter table app_private.enrollment_attempts enable row level security;
alter table app_private.enrollment_tickets enable row level security;
revoke all on app_private.enrollment_attempts, app_private.enrollment_tickets from public, anon, authenticated;

-- Called in a separate transaction so failed Auth creation retains the cooldown.
create function public.rmc_enrollment_reserve(email_hash text, ip_hash text, ticket_hash text)
returns integer language plpgsql security definer set search_path = '' as $$
declare k text; r app_private.enrollment_attempts; duration integer; max_attempts integer; retry integer := 0;
begin
  if email_hash is null or ip_hash is null or ticket_hash is null or email_hash !~ '^[a-f0-9]{64}$' or ip_hash !~ '^[a-f0-9]{64}$' or ticket_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid enrollment reservation.'; end if;
  for k in select unnest(array['email:' || email_hash, 'ip:' || ip_hash]) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
  end loop;
  foreach k in array array['email:' || email_hash, 'ip:' || ip_hash] loop
    duration := case when left(k, 6) = 'email:' then 60 else 600 end;
    max_attempts := case when left(k, 6) = 'email:' then 1 else 5 end;
    select * into r from app_private.enrollment_attempts where key = k;
    if found and r.window_start + make_interval(secs => duration) > now() and r.attempts >= max_attempts then
      retry := greatest(retry, ceil(extract(epoch from r.window_start + make_interval(secs => duration) - now()))::integer);
    end if;
  end loop;
  if retry > 0 then return retry; end if;
  foreach k in array array['email:' || email_hash, 'ip:' || ip_hash] loop
    duration := case when left(k, 6) = 'email:' then 60 else 600 end;
    insert into app_private.enrollment_attempts values (k, now(), 1)
    on conflict (key) do update set
      attempts = case when enrollment_attempts.window_start + make_interval(secs => duration) <= now() then 1 else enrollment_attempts.attempts + 1 end,
      window_start = case when enrollment_attempts.window_start + make_interval(secs => duration) <= now() then now() else enrollment_attempts.window_start end;
  end loop;
  insert into app_private.enrollment_tickets values (email_hash, ticket_hash, now() + interval '5 minutes')
    on conflict on constraint enrollment_tickets_pkey do update set ticket_hash = excluded.ticket_hash, expires_at = excluded.expires_at;
  delete from app_private.enrollment_tickets where expires_at < now();
  delete from app_private.enrollment_attempts where window_start < now() - interval '1 day';
  return 0;
end $$;
revoke all on function public.rmc_enrollment_reserve(text, text, text) from public, anon, authenticated;
grant execute on function public.rmc_enrollment_reserve(text, text, text) to service_role;

-- Database guard blocks direct signup/OAuth from bypassing the enrollment endpoint.
create function app_private.require_enrollment_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app_private.provision_reservations where email = lower(new.email) and created_at > now() - interval '5 minutes') then return new; end if;
  delete from app_private.enrollment_tickets
  where email_hash = encode(extensions.digest(lower(trim(new.email)), 'sha256'), 'hex')
    and ticket_hash = encode(extensions.digest(coalesce(new.raw_user_meta_data->>'enrollment_ticket', ''), 'sha256'), 'hex')
    and expires_at > now();
  if not found then raise exception 'Complete enrollment before creating an account. Use the enrollment form.'; end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'enrollment_ticket';
  return new;
end $$;
revoke all on function app_private.require_enrollment_ticket() from public, anon, authenticated;
create trigger rmc_enrollment_ticket before insert on auth.users for each row execute function app_private.require_enrollment_ticket();
