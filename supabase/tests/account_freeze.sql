-- Transactional account freeze checks. No existing account changes persist.
begin;
do $$
declare owner uuid; other uuid; student uuid; grant_id uuid; event_id uuid;
begin
  select id into owner from public.rmc_profiles where role_id='admin' and status='active' limit 1;
  select id into student from public.rmc_profiles where role_id='student' and status='active' limit 1;
  select id into other from public.rmc_profiles where id<>owner and id<>student limit 1;
  if owner is null or student is null or other is null then raise exception 'Three accounts required for verification.'; end if;
  perform set_config('test.account_owner',owner::text,true);
  perform set_config('test.account_other',other::text,true);
  perform set_config('test.account_student',student::text,true);
  update public.rmc_profiles set role_id='admin',status='active',profile=profile||'{"role":"admin","account_status":"active"}' where id=other;
  update public.rmc_settings set data='{"isFrozen":false,"reason":""}' where id='system_freeze';
  update public.rmc_settings set data='{}' where id='frozen_nodes';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','aal','aal2')::text,true);
  select id into event_id from public.rmc_events limit 1;
  if event_id is null then raise exception 'An event is required for offline checks.'; end if;
  insert into app_private.offline_attendance_sessions(actor_id,event_id,prepared_at,capture_until,sync_until,event_fingerprint,roster,qr_hashes)
    values(owner,event_id,now(),now()+interval '1 hour',now()+interval '3 days','account-freeze-check',
      jsonb_build_array(jsonb_build_object('uid',student)),'[]') returning id into grant_id;
  perform set_config('test.account_grant',grant_id::text,true);
end $$;
set local role authenticated;
do $$
declare owner uuid:=current_setting('test.account_owner')::uuid;
  other uuid:=current_setting('test.account_other')::uuid;
  student uuid:=current_setting('test.account_student')::uuid;
  snapshot jsonb;
begin
  -- Single freeze and authoritative metadata.
  perform public.rmc_set_account_freezes(array[student],true,'Individual pause');
  if not exists(select 1 from jsonb_array_elements(public.rmc_snapshot()->'profiles') p
    where p->>'uid'=student::text and p#>>'{account_freeze,reason}'='Individual pause') then
    raise exception 'Admin snapshot omitted authoritative account freeze.'; end if;
  -- One invalid target must roll back the entire batch.
  begin
    perform public.rmc_set_account_freezes(array[other,'00000000-0000-0000-0000-000000000000'::uuid],true,'Invalid batch');
    raise exception 'Invalid batch was accepted.';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.rmc_account_freezes where account_id=other) then raise exception 'Invalid batch partially applied.'; end if;
  perform public.rmc_set_account_freezes(array[student,other],true,'Batch pause');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other,'role','authenticated','aal','aal2')::text,true);
  if not app_private.access_frozen() then raise exception 'Admin individual freeze bypassed.'; end if;
  snapshot:=public.rmc_snapshot();
  if jsonb_array_length(snapshot->'profiles')<>1 or snapshot#>>'{profiles,0,uid}'<>other::text
    or snapshot->'events'<>'[]'::jsonb or snapshot#>>'{profiles,0,account_freeze,reason}'<>'Batch pause' then
    raise exception 'Frozen admin snapshot leaked data or omitted freeze.'; end if;
  if exists(select 1 from public.rmc_profiles) then raise exception 'Frozen admin bypassed RLS.'; end if;
  begin
    perform public.rmc_set_account_freezes(array[other],false,'');
    raise exception 'Frozen admin unfroze itself.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.path','/rpc/rmc_set_account_freezes',true);
  begin perform app_private.enforce_freeze(); raise exception 'Frozen API bypassed.'; exception when insufficient_privilege then null; end;
  perform set_config('request.path','/rmc_legal_pages',true);
  perform set_config('request.method','GET',true);
  perform app_private.enforce_freeze();
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','aal','aal2')::text,true);
  begin
    perform public.rmc_set_account_freezes(array[owner],true,'Last recovery admin');
    raise exception 'Last active admin was frozen.';
  exception when invalid_parameter_value then null; end;
  perform public.rmc_set_account_freezes(array[student,other],false,'Restored');
  if exists(select 1 from public.rmc_account_freezes where account_id=any(array[student,other])) then raise exception 'Batch unfreeze failed.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated','aal','aal2')::text,true);
  begin
    perform public.rmc_set_account_freezes(array[owner],true,'Unauthorized');
    raise exception 'Student changed account freezes.';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.rmc_account_freezes(account_id,reason) values(owner,'Direct insert');
    raise exception 'Direct account freeze mutation was allowed.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from app_private.offline_attendance_sessions where id=current_setting('test.account_grant')::uuid and sync_until>now()) then
    raise exception 'Account freeze failed to permanently expire the offline grant.';
  end if;
end $$;
-- Pending accounts still receive the safe pause snapshot.
update public.rmc_profiles set status='pending',profile=profile||'{"account_status":"pending"}'
  where id=current_setting('test.account_student')::uuid;
insert into public.rmc_account_freezes(account_id,reason) values(current_setting('test.account_student')::uuid,'Pending pause');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.account_student'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
  if public.rmc_snapshot()#>>'{profiles,0,account_freeze,reason}'<>'Pending pause' then raise exception 'Pending freeze missing.'; end if;
end $$;
reset role;
rollback;
