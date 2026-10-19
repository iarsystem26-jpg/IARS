-- All mutations, including successful refresh signals, roll back. No clients are refreshed.
begin;
do $$
declare actor uuid; sid uuid := extensions.gen_random_uuid();
begin
  select id into strict actor from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1;
  perform set_config('test.refresh_actor', actor::text, true);
  perform set_config('test.refresh_session', sid::text, true);
  insert into auth.sessions(id, user_id, created_at, updated_at) values(sid, actor, now(), now());
  delete from public.rmc_account_freezes where account_id = actor;
  update public.rmc_settings set data = '{"isFrozen":false}' where id = 'system_freeze';
  update public.rmc_settings set data = '{}' where id = 'frozen_nodes';
  delete from public.rmc_audit where action = 'app.refresh_initiated';
end $$;
set local role anon;
do $$ begin
  if (select count(*) from public.rmc_app_release) <> 1 then raise exception 'Logged-out version access failed.'; end if;
  begin
    perform public.rmc_initiate_app_refresh('initiate');
    raise exception 'Anonymous refresh allowed.';
  exception when insufficient_privilege then null; end;
  begin
    update public.rmc_app_release set updated_at = now();
    raise exception 'Anonymous direct update allowed.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Enroll a temporary factor to prove even an aal2 claim needs a fresh factor event.
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
  values(extensions.gen_random_uuid(),current_setting('test.refresh_actor')::uuid,
    'App refresh transactional verification','totp','verified',now(),now(),'transactional-test-only');
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('test.refresh_actor'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', current_setting('test.refresh_session'), 'amr', jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from now()))
  ))::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.rmc_initiate_app_refresh('initiate'); raise exception 'Enrolled MFA bypassed.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('test.refresh_actor'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', current_setting('test.refresh_session'), 'amr', jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from now()) - 600),
    jsonb_build_object('method','mfa/totp','timestamp',extract(epoch from now()))
  ))::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.rmc_initiate_app_refresh('initiate'); raise exception 'Stale password accepted.';
  exception when insufficient_privilege then null; end;
  begin
    update public.rmc_app_release set updated_at = now(); raise exception 'Authenticated direct update allowed.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('test.refresh_actor'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', current_setting('test.refresh_session'), 'amr', jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from now())),
    jsonb_build_object('method','mfa/totp','timestamp',extract(epoch from now()))
  ))::text, true);
set local role authenticated;
do $$
declare before_revision uuid; after_revision uuid;
begin
  begin
    perform public.rmc_initiate_app_refresh('INITIATE'); raise exception 'Wrong confirmation accepted.';
  exception when invalid_parameter_value then null; end;
  select revision into before_revision from public.rmc_app_release;
  after_revision := public.rmc_initiate_app_refresh('initiate');
  if before_revision = after_revision or (select revision from public.rmc_app_release) <> after_revision then
    raise exception 'Refresh signal not changed.';
  end if;
  begin
    perform public.rmc_initiate_app_refresh('initiate'); raise exception 'Repeated refresh accepted.';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.rmc_audit where actor_id = current_setting('test.refresh_actor')::uuid and action = 'app.refresh_initiated') then
    raise exception 'Refresh audit missing.';
  end if;
  update public.rmc_profiles set role_id = 'student', profile = profile || '{"role":"student"}' where id = current_setting('test.refresh_actor')::uuid;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.rmc_initiate_app_refresh('initiate'); raise exception 'Nonadmin refresh accepted.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
