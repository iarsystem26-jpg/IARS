-- Run against a database with the informational schedule migration applied.
-- All fixtures, notifications, and schedule changes roll back.
begin;
do $$
declare admin_id uuid; student_id uuid; scope text:='schedule-test-'||gen_random_uuid(); outside text:=scope||'-outside'; sid uuid; draft jsonb; result jsonb; day date:=(now() at time zone 'Asia/Manila')::date+2; role_name text; filtered public.rmc_calendar_schedules; person jsonb;
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict student_id from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values(scope,'{"name":"Schedule test","type":"section"}'),(outside,'{"name":"Outside test","type":"section"}');
 update public.rmc_profiles set node_id=scope,profile=app_private.assign_profile(profile,scope) where id=student_id;
 draft:=jsonb_build_object('title','Exam preparation notice','description','Bring your review materials.','venue','Library','starts_at',(day+time '08:00') at time zone 'Asia/Manila','ends_at',(day+time '09:00') at time zone 'Asia/Manila','scope_node_id',scope,'recipients',jsonb_build_array('All Students'));
 execute 'set local role authenticated';
 sid:=public.rmc_save_calendar_schedule(null,draft);
 execute 'reset role';
 if not exists(select 1 from public.rmc_notifications where user_id=student_id and source='calendar-schedule:'||sid||':1') then raise exception 'Recipient was not notified'; end if;
 if exists(select 1 from public.rmc_events where id=sid) or exists(select 1 from public.rmc_attendance where event_id=sid) then raise exception 'Schedule became an attendance event'; end if;
 -- Unit AND type: neither everyone in the unit nor mayors outside it qualify.
 select * into filtered from public.rmc_calendar_schedules where id=sid;
 filtered.recipients:=array['All Mayors'];
 select profile into person from public.rmc_profiles where id=student_id;
 if app_private.schedule_recipient(filtered,person) then raise exception 'Unit student passed Mayors filter'; end if;
 if not app_private.schedule_recipient(filtered,person||jsonb_build_object('role','mayor')) then raise exception 'Unit mayor excluded'; end if;
 if app_private.schedule_recipient(filtered,app_private.assign_profile(person||jsonb_build_object('role','mayor'),outside)) then raise exception 'Outside mayor passed unit filter'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student_id::text,true);
 execute 'set local role authenticated';
 result:=public.rmc_personal_calendar(day,day);
 if not exists(select 1 from jsonb_array_elements(result->'items') x where x->>'id'=sid::text and x->>'kind'='informational' and x->>'label'='No attendance required' and x#>>'{schedule,can_manage}'='false') then raise exception 'Recipient calendar missing schedule'; end if;
 begin perform public.rmc_save_calendar_schedule(null,draft); raise exception 'Student created a schedule'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_cancel_calendar_schedule(sid); raise exception 'Student cancelled a schedule'; exception when insufficient_privilege then null; end;
 begin execute 'select * from public.rmc_calendar_schedules'; raise exception 'Direct table read allowed'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 -- Use the same account to verify saved role permissions and academic scope.
 update public.rmc_profiles set node_id=outside,profile=app_private.assign_profile(profile,outside) where id=student_id;
 execute 'set local role authenticated';
 result:=public.rmc_personal_calendar(day,day);
 if exists(select 1 from jsonb_array_elements(result->'items') x where x->>'id'=sid::text) then raise exception 'Schedule leaked to an outside student'; end if;
 execute 'reset role';
 update public.rmc_profiles set node_id=scope,profile=app_private.assign_profile(profile,scope) where id=student_id;
 for role_name in select unnest(array['ssg','ossa']) loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
  update public.rmc_roles set data=jsonb_set(data,'{permissions}',(data->'permissions')-'calendar.manage_schoolwide') where id=role_name;
  update public.rmc_profiles set role_id=role_name,profile=jsonb_set(profile,'{role}',to_jsonb(role_name)) where id=student_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student_id::text,true);
  execute 'set local role authenticated';
  perform public.rmc_save_calendar_schedule(sid,draft||jsonb_build_object('title','Updated information'));
  begin perform public.rmc_save_calendar_schedule(null,draft||jsonb_build_object('scope_node_id',outside)); raise exception 'Outside scope write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.rmc_save_calendar_schedule(null,draft||jsonb_build_object('scope_node_id',null)); raise exception 'Schoolwide write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.rmc_save_calendar_schedule(null,draft||jsonb_build_object('recipients',jsonb_build_array('node:'||outside))); raise exception 'Outside recipient allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.rmc_profiles set role_id='student',profile=jsonb_set(profile,'{role}','"student"') where id=student_id;
 execute 'set local role authenticated';
 perform public.rmc_cancel_calendar_schedule(sid);
 result:=public.rmc_personal_calendar(day,day);
 if not exists(select 1 from jsonb_array_elements(result->'items') x where x->>'id'=sid::text and x->>'cancelled'='true') then raise exception 'Cancellation missing from calendar'; end if;
 execute 'reset role';
 if not exists(select 1 from public.rmc_notifications where user_id=student_id and title like 'Cancelled schedule:%' and source like 'calendar-schedule:'||sid||':%') then raise exception 'Cancellation notification missing'; end if;
 -- Revocation also applies to admin; authorization never uses an admin bypass.
 update public.rmc_roles set data=jsonb_set(data,'{permissions}',(data->'permissions')-'calendar.manage_schedules'-'calendar.manage_closures') where id='admin';
 execute 'set local role authenticated';
 begin perform public.rmc_save_calendar_schedule(null,draft); raise exception 'Revoked admin permission ignored'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select 'informational schedule permission, scope, calendar, notification, and attendance isolation checks passed' as result;
rollback;
