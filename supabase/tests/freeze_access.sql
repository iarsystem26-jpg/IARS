-- Run in a transaction; the existing accounts/settings are restored by rollback.
begin;
do $$
declare student uuid; owner uuid; grant_id uuid; event_id uuid;
begin
  select id into student from public.rmc_profiles where role_id = 'student' and status = 'active' limit 1;
  select id into owner from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1;
  if student is null or owner is null then raise exception 'An active student and admin are required for freeze verification.'; end if;
  perform set_config('test.freeze_student', student::text, true);
  perform set_config('test.freeze_admin', owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into public.rmc_nodes(id, parent_id, data) values
    ('freeze-verification-parent', null, '{"id":"freeze-verification-parent","name":"Test department","type":"department"}'),
    ('freeze-verification-class', 'freeze-verification-parent', '{"id":"freeze-verification-class","name":"Test class","type":"section"}');
  update public.rmc_profiles set node_id = 'freeze-verification-class', profile = profile
    || jsonb_build_object('school_data', jsonb_build_object('academic_assignment', jsonb_build_object('terminalGroupId', 'freeze-verification-class')),
      'official_data', '{}'::jsonb) where id = student;
  select id into event_id from public.rmc_events limit 1;
  if event_id is null then raise exception 'An event is required for offline-grant verification.'; end if;
  insert into app_private.offline_attendance_sessions(actor_id, event_id, prepared_at,
    capture_until, sync_until, event_fingerprint, roster, qr_hashes)
    values(student, event_id, now() - interval '1 minute', now() + interval '1 hour',
      now() + interval '3 days', 'verification', jsonb_build_array(jsonb_build_object('uid', student)), '[]')
    returning id into grant_id;
  perform set_config('test.freeze_grant', grant_id::text, true);
  update public.rmc_settings set data = '{"isFrozen":false,"reason":""}' where id = 'system_freeze';
  update public.rmc_settings set data = data || '{"freeze-verification-parent":{"isFrozen":true,"reason":"Test parent freeze","frozenAt":1791504000000}}' where id = 'frozen_nodes';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', student, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.path', '/rpc/rmc_snapshot', true);
end $$;
set local role authenticated;
do $$
declare snapshot jsonb;
begin
  if not app_private.access_frozen() then raise exception 'Parent freeze was bypassed.'; end if;
  perform app_private.enforce_freeze();
  snapshot := public.rmc_snapshot();
  if jsonb_array_length(snapshot->'profiles') <> 1 or snapshot#>>'{profiles,0,uid}' <> current_setting('test.freeze_student') then raise exception 'Frozen snapshot leaked another profile.'; end if;
  if snapshot->'events' <> '[]'::jsonb or snapshot->'attendance' <> '[]'::jsonb or snapshot->'applications' <> '[]'::jsonb or snapshot->'roles' <> '{}'::jsonb then raise exception 'Frozen snapshot leaked workspace data.'; end if;
  if snapshot#>>'{settings,frozen_nodes,freeze-verification-parent,reason}' <> 'Test parent freeze' then raise exception 'Freeze reason missing.'; end if;
  if snapshot#>'{profiles,0,guardian}' is not null or snapshot#>'{profiles,0,documents}' is not null then raise exception 'Frozen snapshot leaked personal documents.'; end if;
  if exists(select 1 from public.rmc_profiles) or exists(select 1 from public.rmc_events) or exists(select 1 from public.rmc_attendance) or exists(select 1 from public.rmc_settings) then raise exception 'Frozen account bypassed restrictive RLS.'; end if;
  perform set_config('request.path', '/rmc_legal_pages', true);
  perform set_config('request.method', 'GET', true);
  perform app_private.enforce_freeze();
  if (select count(*) from public.rmc_legal_pages) <> 4 then raise exception 'Frozen account cannot read public legal pages.'; end if;
  perform set_config('request.method', 'HEAD', true);
  perform app_private.enforce_freeze();
  perform set_config('request.method', 'PATCH', true);
  begin
    perform app_private.enforce_freeze();
    raise exception 'Frozen legal editing was allowed.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.method', 'GET', true);
  perform set_config('request.path', '/rmc_profiles', true);
  begin
    perform app_private.enforce_freeze();
    raise exception 'Direct table API freeze bypassed.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.path', '/rpc/rmc_command', true);
  perform set_config('request.method', 'POST', true);
  begin
    perform app_private.enforce_freeze();
    raise exception 'Direct RPC freeze bypassed.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from app_private.offline_attendance_sessions
    where id = current_setting('test.freeze_grant')::uuid and sync_until > now()) then
    raise exception 'Pre-freeze offline grant was not expired.';
  end if;
end $$;
-- The master freeze blocks even users who have no academic assignment.
update public.rmc_settings set data = '{"isFrozen":true,"reason":"Test master freeze"}' where id = 'system_freeze';
update public.rmc_profiles set node_id = null, profile = profile || '{"school_data":{},"official_data":{}}' where id = current_setting('test.freeze_student')::uuid;
set local role authenticated;
do $$ begin
  if not app_private.access_frozen() or public.rmc_snapshot()#>>'{settings,system_freeze,reason}' <> 'Test master freeze' then raise exception 'Master freeze was bypassed.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.freeze_admin'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  if app_private.access_frozen() then raise exception 'Admin recovery access was blocked.'; end if;
  perform app_private.enforce_freeze();
  if not exists(select 1 from public.rmc_profiles) then raise exception 'Admin RLS recovery was blocked.'; end if;
end $$;
reset role;
update public.rmc_settings set data = '{"isFrozen":false,"reason":""}' where id = 'system_freeze';
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.freeze_student'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  if app_private.access_frozen() then raise exception 'Unfreeze did not restore access.'; end if;
  perform app_private.enforce_freeze();
  if not exists(select 1 from public.rmc_profiles where id = (select auth.uid())) then raise exception 'Unfreeze did not restore RLS reads.'; end if;
  begin
    perform public.rmc_sync_offline_attendance(jsonb_build_object('id', gen_random_uuid(),
      'sessionId', current_setting('test.freeze_grant'), 'studentUid', current_setting('test.freeze_student'),
      'direction', 'in', 'capturedAt', extract(epoch from now()) * 1000, 'manualReason', 'Verification identity check'));
    raise exception 'Expired offline grant was replayed after unfreezing.';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
rollback;
