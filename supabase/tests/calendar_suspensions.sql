-- Uses existing test accounts and isolated academic units; all writes roll back.
begin;
do $$
declare admin_uid uuid; student uuid; unaffected uuid; root text:='calendar-test-'||gen_random_uuid(); unit text; other_unit text;
 shared uuid:=gen_random_uuid(); full_event uuid:=gen_random_uuid(); move_event uuid:=gen_random_uuid(); cancelled uuid:=gen_random_uuid(); active_event uuid:=gen_random_uuid(); ended uuid:=gen_random_uuid(); corrected_event uuid:=gen_random_uuid(); merit_event uuid:=gen_random_uuid(); open_service uuid:=gen_random_uuid();
 first_day date:=(now() at time zone 'Asia/Manila')::date+2; today date:=(now() at time zone 'Asia/Manila')::date; org uuid:=gen_random_uuid(); org_event uuid:=gen_random_uuid(); boundary uuid:=gen_random_uuid();
 starts timestamptz; preview jsonb; cid uuid; saved jsonb; result jsonb; before_balance numeric; n integer;
begin
 select id into strict admin_uid from public.rmc_profiles where is_test_account and status='active' and role_id='admin' limit 1;
 select id into strict student from public.rmc_profiles where is_test_account and status='active' and role_id='student' limit 1;
 select id into strict unaffected from public.rmc_profiles where is_test_account and status='active' and role_id='mayor' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_uid::text,true);
 unit:=root||'-class'; other_unit:=root||'-other';
 insert into public.rmc_nodes(id,data) values(root,'{"name":"Calendar rollback test","type":"department"}');
 insert into public.rmc_nodes(id,parent_id,data) values(unit,root,'{"name":"Affected class","type":"section"}'),(other_unit,null,'{"name":"Unaffected class","type":"section"}');
 update public.rmc_profiles set node_id=unit,created_at=now()-interval '5 days',profile=app_private.assign_profile(profile,unit) where id=student;
 update public.rmc_profiles set node_id=other_unit,created_at=now()-interval '5 days',profile=app_private.assign_profile(profile,other_unit) where id=unaffected;
 delete from public.rmc_account_freezes where account_id in (student,unaffected,admin_uid);
 starts:=(first_day+time '09:00') at time zone 'Asia/Manila';
 insert into public.rmc_events(id,created_by,start_at,end_at,data) values
 (shared,admin_uid,starts,starts+interval '1 hour',jsonb_build_object('title','Shared activity','kind','attendance','status','upcoming','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',2,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text,unaffected::text)))),
 (full_event,admin_uid,starts,starts+interval '1 hour',jsonb_build_object('title','Wholly affected','kind','attendance','status','upcoming','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',2,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)))),
 (move_event,admin_uid,starts,starts+interval '1 hour',jsonb_build_object('title','Move together','kind','service','service',jsonb_build_object('overflow','clear'),'status','upcoming','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)))),
 (cancelled,admin_uid,starts,starts+interval '1 hour',jsonb_build_object('title','Cancel together','kind','attendance','status','upcoming','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text))));
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure(first_day,first_day,array[root]);
 if not exists(select 1 from jsonb_array_elements(preview->'activities') where value->>'id'=shared::text and (value->>'affected')::int=1 and (value->>'unaffected')::int=1 and (value->>'can_change')::boolean=false) then raise exception 'Scoped shared preview incorrect: %',preview; end if;
 begin
  perform public.rmc_apply_closure(first_day,first_day,array[root],'Scoped notice','Official safety reason','suspension','cancel',array[full_event,shared],0,preview->>'token');
  raise exception 'TEST FAILED: partial-scope global cancellation accepted';
 exception when others then if sqlerrm not like 'Only wholly affected%' then raise; end if; end;
 execute 'reset role';
 if (select data->>'cancellationStatus' from public.rmc_events where id=full_event) is not null then raise exception 'Failed batch changed a prior activity'; end if;
 if exists(select 1 from public.rmc_calendar_closures where title='Scoped notice') then raise exception 'Failed batch saved a closure'; end if;
 -- Mutation after preview must invalidate the entire request.
 update public.rmc_events set data=data||'{"title":"Updated title"}' where id=full_event;
 execute 'set local role authenticated';
 begin
  perform public.rmc_apply_closure(first_day,first_day,array[root],'Stale notice','Official safety reason','suspension','suspend','{}',0,preview->>'token');
  raise exception 'TEST FAILED: stale preview accepted';
 exception when others then if sqlerrm not like 'Schedules changed%' then raise; end if; end;
 preview:=public.rmc_preview_closure(first_day,first_day,array[root]);
 cid:=public.rmc_apply_closure(first_day,first_day,array[root],'Scoped notice','Official safety reason','suspension','cancel',array[cancelled],0,preview->>'token');
 execute 'reset role';
 if (select data->>'cancellationStatus' from public.rmc_events where id=cancelled)<>'cancelled' then raise exception 'Batch cancellation missing'; end if;
 if not app_private.session_suspended((select e from public.rmc_events e where id=shared),(select profile from public.rmc_profiles where id=student),first_day) then raise exception 'Descendant student not suspended'; end if;
 if app_private.session_suspended((select e from public.rmc_events e where id=shared),(select profile from public.rmc_profiles where id=unaffected),first_day) then raise exception 'Unrelated student suspended'; end if;
 -- Rescheduling retains recipients and service policy while moving out of closed dates.
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure(first_day,first_day,array[root],1);
 perform public.rmc_apply_closure(first_day,first_day,array[root],'Move notice','Official safety reason','holiday','reschedule',array[move_event],1,preview->>'token');
 execute 'reset role';
 if (select start_at from public.rmc_events where id=move_event)<>starts+interval '1 day' then raise exception 'Rescheduling failed'; end if;
 if (select data#>>'{service,overflow}' from public.rmc_events where id=move_event)<>'clear' then raise exception 'Service rules changed'; end if;
 -- Student RPC is personal and honors membership/scope. No direct closure-table reads.
 insert into public.rmc_events(id,created_by,start_at,end_at,data) values
 (boundary,admin_uid,starts-interval '11 hours',starts-interval '9 hours',jsonb_build_object('title','Ends exactly at midnight','kind','attendance','status','upcoming','startTime',extract(epoch from starts-interval '11 hours')*1000,'endTime',extract(epoch from starts-interval '9 hours')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text))));
 if app_private.session_suspended((select e from public.rmc_events e where id=boundary),(select profile from public.rmc_profiles where id=student),first_day) then raise exception 'Boundary event incorrectly suspended on the next day'; end if;
 if exists(select 1 from jsonb_array_elements(public.rmc_preview_closure(first_day,first_day,array[root])->'activities') where value->>'id'=boundary::text) then raise exception 'Preview included activity ending before closure'; end if;
 insert into public.rmc_organizations(id,name,head_ids) values(org,'Calendar organization rollback',array[admin_uid]);
 insert into public.rmc_organization_members(organization_id,student_id,status) values(org,student,'approved'),(org,unaffected,'pending');
 insert into public.rmc_events(id,created_by,organization_id,start_at,end_at,data) values
 (org_event,admin_uid,org,starts,starts+interval '1 hour',jsonb_build_object('title','Organization activity','kind','attendance','organizationId',org,'approvalStatus','approved','status','upcoming','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 execute 'set local role authenticated';
 result:=public.rmc_personal_calendar(first_day,first_day+1);
 if not exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=shared::text
  and value#>>'{details,audience}'='Selected participants' and (value#>>'{details,late_rule,value}')::numeric=2
  and value#>>'{details,starts_at}' is not null and not (value->'details' ? 'specificUserIds')) then raise exception 'Calendar full details missing or disclose recipient identities'; end if;
 if not exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=org_event::text
  and value#>>'{details,organization_name}'='Calendar organization rollback') then raise exception 'Calendar organization context missing'; end if;
 if not exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=shared::text and (value->>'suspended')::boolean) then raise exception 'Personal suspension missing'; end if;
 if jsonb_array_length(result->'closures')<>2 then raise exception 'Scoped notices missing'; end if;
 if exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=boundary::text) then raise exception 'Calendar included activity ending exactly at midnight'; end if;
 if not exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=org_event::text and value->>'kind'='organization' and (value->>'suspended')::boolean) then raise exception 'Approved organization calendar missing'; end if;
 begin perform public.rmc_calendar_closures(); raise exception 'TEST FAILED: student read admin history'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_preview_closure(first_day,first_day,'{}'); raise exception 'TEST FAILED: student previewed school'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.rmc_calendar_closures; raise exception 'TEST FAILED: student directly read closure table'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',unaffected,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',unaffected::text,true);
 result:=public.rmc_personal_calendar(first_day,first_day+1);
 if jsonb_array_length(result->'closures')<>0 or not exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=shared::text and not (value->>'suspended')::boolean) then raise exception 'Unaffected calendar changed'; end if;
 if exists(select 1 from jsonb_array_elements(result->'items') where value->>'event_id'=org_event::text) then raise exception 'Pending organization member accessed calendar'; end if;
 -- Today: scanner, offline capture, corrections and finalization all enforce the same rule.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_uid::text,true);
 insert into public.rmc_events(id,created_by,start_at,end_at,data) values
 (active_event,admin_uid,now()-interval '5 minutes',now()+interval '1 hour',jsonb_build_object('title','Active suspended test','kind','attendance','status','active','startTime',extract(epoch from now()-interval '5 minutes')*1000,'endTime',extract(epoch from now()+interval '1 hour')*1000,'geofenceEnabled',false,'penaltyValue',1,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)))),
 (ended,admin_uid,now()-interval '5 minutes',now()-interval '1 minute',jsonb_build_object('title','Ended suspended test','kind','attendance','status','done','startTime',extract(epoch from now()-interval '5 minutes')*1000,'endTime',extract(epoch from now()-interval '1 minute')*1000,'geofenceEnabled',false,'penaltyValue',1,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text))));
 perform app_private.sanction(student,1,'Automatic test absence',ended,'absent:'||ended||':'||student||':default');
 insert into public.rmc_attendance values(ended,student,'default','{"status":"absent","slot":"default"}');
 insert into public.rmc_events(id,created_by,start_at,end_at,data)
 select corrected_event,created_by,start_at,end_at,data||jsonb_build_object('title','Corrected absence suspension test') from public.rmc_events where id=ended;
 perform app_private.sanction(student,2,'Corrected missing attendance',corrected_event,'correction:'||corrected_event||':'||student||':default:'||gen_random_uuid());
 insert into public.rmc_attendance values(corrected_event,student,'default','{"status":"absent","slot":"default","assessed_sanction_hours":2}');
 before_balance:=app_private.balance(student);
 preview:=public.rmc_preview_closure(today,today,array[root]);
 perform public.rmc_apply_closure(today,today,array[root],'Today notice','Official safety reason','suspension','suspend','{}',0,preview->>'token');
 if app_private.balance(student)<>greatest(0,before_balance-3) then raise exception 'Automatic absence adjustment incorrect'; end if;
 if exists(select 1 from public.rmc_attendance where event_id=ended and student_id=student) then raise exception 'Suspended absence requirement retained'; end if;
 begin perform app_private.record_attendance(active_event,student,'in',null,null,'Rollback test entry'); raise exception 'TEST FAILED: online attendance accepted'; exception when others then if sqlerrm not like 'Attendance is suspended%' then raise; end if; end;
 begin perform app_private.record_offline_attendance_at(active_event,student,'in',null,null,'Rollback test entry',now()); raise exception 'TEST FAILED: offline attendance accepted'; exception when others then if sqlerrm not like 'Attendance is suspended%' then raise; end if; end;
 if exists(select 1 from app_private.correction_sessions((select e from public.rmc_events e where id=ended),(select profile from public.rmc_profiles where id=student))) then raise exception 'Suspended correction session available'; end if;
 for n in 1..20 loop perform app_private.finalize_events(); exit when (select finalized_at is not null from public.rmc_events where id=ended); end loop;
 if exists(select 1 from public.rmc_attendance where event_id=ended and student_id=student) then raise exception 'Finalizer added suspended absence'; end if;
 if app_private.balance(student)<>greatest(0,before_balance-3) then raise exception 'Finalizer charged suspended absence'; end if;
 -- A fixed merit activity requires the remaining sessions, with no award from a suspended day.
 starts:=(today+time '00:00') at time zone 'Asia/Manila';
 insert into public.rmc_events(id,created_by,start_at,end_at,data) values
 (merit_event,admin_uid,starts,starts+interval '2 days'-interval '1 minute',jsonb_build_object('title','Merit spanning suspension','kind','merit','meritHours',0.5,'status','active','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '2 days'-interval '1 minute')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours',
 'attendanceWindows',jsonb_build_array(jsonb_build_object('id','w','timeIn','08:00','timeOut','10:00','lateAfterMinutes',15)),
 'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)))),
 (open_service,admin_uid,starts,starts+interval '2 days'-interval '1 minute',jsonb_build_object('title','Open suspended service','kind','service','status','active','startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '2 days'-interval '1 minute')*1000,'geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours',
 'attendanceWindows',jsonb_build_array(jsonb_build_object('id','w','timeIn','08:00','timeOut','10:00','lateAfterMinutes',15)),
 'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text))));
 insert into public.rmc_attendance values(open_service,student,today||':w',jsonb_build_object('status','present','time_in',extract(epoch from starts+interval '8 hours')*1000));
 if (select count(*) from app_private.correction_sessions((select e from public.rmc_events e where id=merit_event),(select profile from public.rmc_profiles where id=student)))<>1 then raise exception 'Merit requirements did not skip closed day'; end if;
 perform app_private.sanction(student,1,'Merit fixture balance'); before_balance:=app_private.balance(student);
 result:=app_private.record_offline_attendance_at(merit_event,student,'in',null,null,'Rollback test entry',starts+interval '1 day 8 hours');
 if app_private.balance(student)<>before_balance then raise exception 'Merit awarded on check-in'; end if;
 result:=app_private.record_offline_attendance_at(merit_event,student,'out',null,null,'Rollback test entry',starts+interval '1 day 9 hours');
 if (result->>'awarded_hours')::numeric<>0.5 or app_private.balance(student)<>before_balance-0.5 then raise exception 'Fixed merit not awarded after remaining session: %',result; end if;
 if not exists(select 1 from public.rmc_attendance where event_id=open_service and student_id=student and data->>'time_out' is null) then raise exception 'Suspension changed original participation history'; end if;
end $$;
select 'PASS: scoped closures, descendants, shared recipients, atomic cancellation, stale previews, rescheduling, personal calendars, access gates, online/offline blocking, absence reversal/finalization, remaining merit requirements and suspended open participation' result;
rollback;
