create table public.rmc_homepage_video (
  id text primary key check (id = 'homepage'),
  video_id text not null check (video_id ~ '^(videos|video-explainer)/[A-Za-z0-9_-]+\.(mp4|webm)$'),
  updated_at timestamptz not null default now()
);
alter table public.rmc_homepage_video enable row level security;
revoke all on public.rmc_homepage_video from anon, authenticated;
grant select on public.rmc_homepage_video to anon, authenticated;
grant update (video_id) on public.rmc_homepage_video to authenticated;
grant all on public.rmc_homepage_video to service_role;
create policy homepage_video_read on public.rmc_homepage_video for select to anon, authenticated using (true);
create policy homepage_video_admin_update on public.rmc_homepage_video for update to authenticated
using ((select role_id from app_private.actor()) = 'admin')
with check ((select role_id from app_private.actor()) = 'admin');
create function app_private.touch_homepage_video() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function app_private.touch_homepage_video() from public, anon, authenticated;
create trigger touch_homepage_video before update on public.rmc_homepage_video
for each row execute function app_private.touch_homepage_video();
insert into public.rmc_homepage_video (id, video_id) values ('homepage', 'videos/iars-explainer-1080p.mp4');
