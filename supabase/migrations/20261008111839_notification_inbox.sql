begin;
create table public.rmc_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.rmc_profiles(id) on delete cascade,
 source text not null, title text not null, detail text not null default '',
 path text not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,source)
);
create index rmc_notifications_inbox_idx on public.rmc_notifications(user_id,created_at desc);
alter table public.rmc_notifications enable row level security;
revoke all on public.rmc_notifications from anon,authenticated;
grant select on public.rmc_notifications to authenticated;
grant update(read_at) on public.rmc_notifications to authenticated;
grant all on public.rmc_notifications to service_role;
create policy notification_read on public.rmc_notifications for select to authenticated
 using(user_id=(select auth.uid()));
create policy notification_update on public.rmc_notifications for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Internal triggers deliver notices across recipients; clients can only change read_at.
create function app_private.notify_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' then
  insert into public.rmc_notifications(user_id,source,title,detail,path)
  values(new.id,'welcome','Welcome to IARS!', 'Your account is ready. View your events, attendance records, and account details.',
   '/student/profile')
  on conflict(user_id,source) do nothing;
 end if;
 return new;
end $$;
create trigger notification_account after insert or update of status on public.rmc_profiles
 for each row execute function app_private.notify_account();

create function app_private.notify_event(ev public.rmc_events, phase text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if ev.data->>'status' in ('pending','rejected') or ev.data->>'approvalStatus' in ('pending','rejected') then return; end if;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select p.id, 'event:'||ev.id||':'||phase||':'||ev.start_at::text||':'||ev.end_at::text,
  case phase when 'soon' then 'Starting in one hour: ' when 'started' then 'Starting now: '
   when 'cancelled' then 'Cancelled: ' else 'Scheduled event: ' end || (ev.data->>'title'),
  'Schedule: '||to_char(ev.start_at at time zone 'Asia/Manila','Mon DD, YYYY HH12:MI AM')||' (Manila)',
  case when p.role_id='student' then case when ev.data->>'kind'='flag_ceremony' then '/student/ceremonies' else '/student/events' end
   when p.role_id='ssg' then '/ssg/events' when p.role_id in ('ossa','ossa_staff') then '/ossa/dashboard' else '/student/events' end
 from public.rmc_profiles p where p.status='active' and app_private.recipient(ev.data,p.profile || jsonb_build_object('uid',p.id,'role',p.role_id))
 on conflict(user_id,source) do nothing;
end $$;
create function app_private.notify_event_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.data->>'cancellationStatus'='cancelled' and old.data->>'cancellationStatus' is distinct from 'cancelled' then
   perform app_private.notify_event(new,'cancelled'); return new;
  end if;
  if new.start_at=old.start_at and new.end_at=old.end_at and new.data->'approvalStatus' is not distinct from old.data->'approvalStatus'
   and new.data->'audienceTarget' is not distinct from old.data->'audienceTarget' then return new; end if;
 end if;
 if new.end_at>now() and new.data->>'cancellationStatus' is distinct from 'cancelled' then
  perform app_private.notify_event(new,'scheduled');
 end if;
 return new;
end $$;
create trigger notification_event after insert or update on public.rmc_events
 for each row execute function app_private.notify_event_change();

create function app_private.notify_excuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.data->'status' is not distinct from old.data->'status' then return new; end if;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 values(new.student_id,'excuse:'||new.id||':'||(new.data->>'status'),
  'Excuse letter: '||coalesce(new.data->>'status','pending'),
  coalesce(new.data->>'event_title','Your event')||case when new.data->>'status'='pending' then ' — Submitted and awaiting review.'
   else ' — '||coalesce(nullif(new.data->>'review_notes',''),'Your review has been completed.') end,'/student/records')
 on conflict(user_id,source) do nothing;
 return new;
end $$;
create trigger notification_excuse after insert or update on public.rmc_excuses
 for each row execute function app_private.notify_excuse();

create function app_private.notify_system() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.id not in ('system_freeze','system_update') then return new; end if;
 if tg_op='UPDATE' and new.data is not distinct from old.data then return new; end if;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select id,'system:'||new.id||':'||gen_random_uuid(),
  case when new.id='system_update' then coalesce(new.data->>'title','System update')
   when new.data->>'isFrozen'='true' then 'System temporarily paused' else 'System access restored' end,
  coalesce(new.data->>'message',nullif(new.data->>'reason',''),'Institutional system availability has changed.'),
  '/dashboard'
 from public.rmc_profiles where status='active';
 return new;
end $$;
create trigger notification_system after insert or update on public.rmc_settings
 for each row execute function app_private.notify_system();

create function app_private.notification_reminders() returns void
language plpgsql security definer set search_path='' as $$
declare ev public.rmc_events;
begin
 for ev in select * from public.rmc_events where end_at>now() and finalized_at is null
  and start_at<=now()+interval '1 hour' and data->>'status' not in ('pending','rejected','done')
  and data->>'cancellationStatus' is distinct from 'cancelled' loop
  perform app_private.notify_event(ev,case when ev.start_at<=now() then 'started' else 'soon' end);
 end loop;
end $$;
revoke all on function app_private.notify_account(),app_private.notify_event(public.rmc_events,text),
 app_private.notify_event_change(),app_private.notify_excuse(),app_private.notify_system(),app_private.notification_reminders()
 from public,anon,authenticated;
select cron.schedule('rmc-notification-reminders','* * * * *','select app_private.notification_reminders()');
insert into public.rmc_notifications(user_id,source,title,detail,path)
 select id,'welcome','Welcome to IARS!','Your account is ready. Keep track of your events and attendance here.',
 '/student/profile' from public.rmc_profiles where status='active';
do $$ declare ev public.rmc_events; begin
 for ev in select * from public.rmc_events where end_at>now() and data->>'status' not in ('done','pending','rejected')
  and data->>'cancellationStatus' is distinct from 'cancelled' loop perform app_private.notify_event(ev,'scheduled'); end loop;
end $$;
alter publication supabase_realtime add table public.rmc_notifications;
commit;

