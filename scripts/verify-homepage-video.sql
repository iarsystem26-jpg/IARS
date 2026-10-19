begin;
set local role anon;
do $$ begin
if (select count(*) from public.rmc_homepage_video) <> 1 then raise exception 'Public read failed'; end if;
begin update public.rmc_homepage_video set video_id = 'videos/test.mp4'; raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true) from public.rmc_profiles where role_id='student' and status='active' limit 1;
set local role authenticated;
do $$ declare changed integer; begin
update public.rmc_homepage_video set video_id='videos/test.mp4';
get diagnostics changed = row_count;
if changed <> 0 then raise exception 'Student write allowed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true) from public.rmc_profiles where role_id='admin' and status='active' limit 1;
set local role authenticated;
do $$ declare version timestamptz; changed integer; begin
if (select role_id from app_private.actor()) is distinct from 'admin' then raise exception 'No admin actor'; end if;
select updated_at into version from public.rmc_homepage_video;
update public.rmc_homepage_video set video_id='video-explainer/IARS-Advertisement-4K-60FPS.mp4' where updated_at=version;
get diagnostics changed = row_count;
if changed <> 1 then raise exception 'Admin save failed'; end if;
update public.rmc_homepage_video set video_id='videos/test.mp4' where updated_at=version;
get diagnostics changed = row_count;
if changed <> 0 then raise exception 'Stale write allowed'; end if;
begin
update public.rmc_homepage_video set video_id='https://example.com/video.mp4';
raise exception 'External URL accepted';
exception when check_violation then null; end;
begin delete from public.rmc_homepage_video; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
begin insert into public.rmc_homepage_video(id,video_id) values('other','videos/test.mp4'); raise exception 'Insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Homepage video public read, admin save, denied writes, validation and conflict checks passed; writes rolled back.' as result;
