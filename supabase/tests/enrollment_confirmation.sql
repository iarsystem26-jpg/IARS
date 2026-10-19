-- Run alone after migration, or append to the migration with its COMMIT removed.
-- All test users, sessions, factors, settings, and audit entries roll back.
begin;
do $$ declare actor uuid; sid uuid := extensions.gen_random_uuid(); begin
 select id into strict actor from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1;
 perform set_config('test.enrollment_actor',actor::text,true);
 perform set_config('test.enrollment_session',sid::text,true);
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
 delete from public.rmc_account_freezes where account_id = actor;
 update public.rmc_settings set data = '{"isFrozen":false}' where id = 'system_freeze';
 update public.rmc_settings set data = '{}' where id = 'frozen_nodes';
end $$;
set local role anon;
do $$ begin
 if (select count(*) from public.rmc_enrollment_confirmation) <> 1 then raise exception 'Public settings read failed'; end if;
 begin perform public.rmc_set_enrollment_confirmation('initiate'); raise exception 'Anonymous settings allowed'; exception when insufficient_privilege then null; end;
 begin update public.rmc_enrollment_confirmation set mode = 'bypass'; raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
values(extensions.gen_random_uuid(),current_setting('test.enrollment_actor')::uuid,'Enrollment test','totp','verified',now(),now(),'test-only');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.enrollment_actor'),'role','authenticated','aal','aal1',
 'session_id',current_setting('test.enrollment_session'),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now()))))::text,true);
set local role authenticated;
do $$ begin
 begin perform public.rmc_set_enrollment_confirmation('initiate'); raise exception 'MFA bypassed'; exception when insufficient_privilege then null; end;
 begin update public.rmc_enrollment_confirmation set mode = 'bypass'; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.enrollment_actor'),'role','authenticated','aal','aal2',
 'session_id',current_setting('test.enrollment_session'),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())-600),jsonb_build_object('method','mfa/totp','timestamp',extract(epoch from now()))))::text,true);
set local role authenticated;
do $$ begin
 begin perform public.rmc_set_enrollment_confirmation('initiate'); raise exception 'Stale password allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.enrollment_actor'),'role','authenticated','aal','aal2',
 'session_id',current_setting('test.enrollment_session'),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())),jsonb_build_object('method','mfa/totp','timestamp',extract(epoch from now()))))::text,true);
set local role authenticated;
do $$ declare settings jsonb; begin
 begin perform public.rmc_set_enrollment_confirmation('INITIATE'); raise exception 'Wrong text accepted'; exception when raise_exception then
  if sqlerrm <> 'Type initiate exactly to confirm.' then raise; end if; end;
 settings := public.rmc_set_enrollment_confirmation('initiate');
 settings := jsonb_set(settings,'{mode}','"google_only"');
 perform public.rmc_set_enrollment_confirmation('initiate',settings);
 if (select mode from public.rmc_enrollment_confirmation) <> 'google_only' then raise exception 'Settings not saved'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.rmc_audit where action = 'enrollment.confirmation_updated' and actor_id = current_setting('test.enrollment_actor')::uuid) then raise exception 'Audit missing'; end if;
 update public.rmc_profiles set role_id = 'student',profile = profile || '{"role":"student"}' where id = current_setting('test.enrollment_actor')::uuid;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.rmc_set_enrollment_confirmation('initiate'); raise exception 'Non-superadmin allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 update auth.users set email_confirmed_at = null, raw_app_meta_data = raw_app_meta_data || '{"enrollment_confirmation_required":true}' where id = current_setting('test.enrollment_actor')::uuid;
 if app_private.session_allowed() then raise exception 'Unconfirmed applicant session allowed'; end if;
end $$;
select 'Enrollment confirmation database security checks passed' as result;
rollback;
