-- Integration checks use existing test identities and isolated records. All changes roll back.
begin;
do $$
declare student uuid; reviewer uuid; outsider uuid; ev uuid:=gen_random_uuid(); missing uuid:=gen_random_uuid(); req uuid;
 node text:='correction-test-'||gen_random_uuid(); other_node text:='correction-test-'||gen_random_uuid();
 starts timestamptz:=date_trunc('day',now())-interval '2 days'; ends timestamptz; original jsonb; current_record jsonb;
 balance_before numeric; before_decision numeric; proposed timestamptz; blocked boolean;
begin
 select id into strict student from public.rmc_profiles where is_test_account and status='active' and role_id='student' limit 1;
 select id into strict reviewer from public.rmc_profiles where is_test_account and status='active' and role_id='admin' limit 1;
 select id into strict outsider from public.rmc_profiles where is_test_account and status='active' and role_id='ossa' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 ends:=starts+interval '2 hours'; proposed:=starts+interval '5 minutes';
 insert into public.rmc_nodes(id,data) values(node,jsonb_build_object('name','Correction test section','type','section')),
 (other_node,jsonb_build_object('name','Correction test other section','type','section'));
 update public.rmc_profiles set node_id=node,created_at=starts-interval '1 day',
 profile=app_private.assign_profile(profile,node) where id=student;
 update public.rmc_profiles set node_id=other_node where id=outsider;
 -- Test identities may be intentionally frozen from a prior demonstration.
 delete from public.rmc_account_freezes where account_id in (student,reviewer,outsider);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 select id,reviewer,node,starts,ends,now(),jsonb_build_object('title','Correction integration fixture','kind','attendance','status','done',
 'startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from ends)*1000,'geofenceEnabled',false,
 'penaltyValue',2,'penaltyUnit','hours','sanctionRules',jsonb_build_object('late',jsonb_build_object('value',30,'unit','minutes'),'absent',jsonb_build_object('value',2,'unit','hours')),
 'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)), 'scopeNodeId',node)
 from unnest(array[ev,missing]) id;
 original:=jsonb_build_object('status','absent','slot','default','scanned_by_name','System','recorded_at',extract(epoch from now())*1000);
 insert into public.rmc_attendance values(ev,student,'default',original);
 perform app_private.sanction(student,2,'Test absence',ev,'absent:'||ev||':'||student||':default');
 perform app_private.sanction(student,5,'Unrelated test sanction',null,'unrelated:'||ev);
 balance_before:=app_private.balance(student);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 execute 'set local role authenticated';
 if not exists(select 1 from jsonb_array_elements(public.rmc_correction_options()) v where v->>'event_id'=missing::text) then raise exception 'Missing session option unavailable'; end if;
 req:=public.rmc_submit_attendance_correction(ev,'default','I attended but my scan was not saved.',proposed,null,null);
 if (select count(*) from public.rmc_attendance_corrections where id=req)<>1 then raise exception 'Owner cannot read request'; end if;
 begin
  perform public.rmc_submit_attendance_correction(ev,'default','Duplicate request should be rejected.',proposed,null,null);
  raise exception 'TEST FAILED: duplicate accepted';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.rmc_submit_attendance_correction(missing,'invented-session','Invented session should be rejected.',proposed,null,null);
  raise exception 'TEST FAILED: fabricated slot accepted';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.rmc_submit_attendance_correction(missing,'default','Invalid evidence should be rejected.',proposed,null,'storage://other/corrections/test.pdf');
  raise exception 'TEST FAILED: foreign evidence accepted';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Student self approval',proposed,null);
  raise exception 'TEST FAILED: student approval accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.rmc_attendance_corrections set status='approved' where id=req;
  raise exception 'TEST FAILED: direct update accepted';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.rmc_attendance_corrections where id=req;
  raise exception 'TEST FAILED: direct delete accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.rmc_attendance_corrections(student_id,event_id,slot,student_name,student_number,event_title,reason)
   values(student,missing,'default','Fake','Fake','Fake','Direct insertion should fail');
  raise exception 'TEST FAILED: direct insert accepted';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 if app_private.balance(student)<>balance_before then raise exception 'Submission modified sanctions'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.rmc_attendance_corrections where id=req) then raise exception 'Out-of-scope reviewer can read request'; end if;
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Outside scope approval',proposed,null);
  raise exception 'TEST FAILED: outside scope approval accepted';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 execute 'set local role authenticated';
 if not exists(select 1 from public.rmc_attendance_corrections where id=req) then raise exception 'Reviewer cannot read request'; end if;
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Invalid verified time',starts-interval '1 hour',null);
  raise exception 'TEST FAILED: out-of-window time accepted';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 perform public.rmc_review_attendance_correction(req,'approved','Verified attendance with officer.',starts+interval '30 minutes',null);
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Repeated decision',proposed,null);
  raise exception 'TEST FAILED: second review accepted';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 execute 'reset role';
 if app_private.balance(student)<>balance_before-1.5 then raise exception 'Absent to late did not reconcile exact session penalty'; end if;
 if (select data->>'status' from public.rmc_attendance where event_id=ev and student_id=student and slot='default')<>'late' then raise exception 'Late threshold not derived'; end if;
 if (select c.original from public.rmc_attendance_corrections c where c.id=req) is distinct from original then raise exception 'Original history was overwritten'; end if;
 if not exists(select 1 from public.rmc_notifications where user_id=student and source='attendance-correction:'||req||':approved') then raise exception 'Decision notification missing'; end if;
 if not exists(select 1 from public.rmc_audit where data->>'request_id'=req::text and action='attendance.correction.approved') then raise exception 'Decision audit missing'; end if;
 -- Repeat a correction, then check stale protection and rejection/resubmission.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','Officer confirmed I arrived on time.',proposed,null,null);
 update public.rmc_attendance set data=data||'{"test_changed":true}' where event_id=ev and student_id=student;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Stale record approval',proposed,null);
  raise exception 'TEST FAILED: stale record accepted';
 exception when others then
  if sqlerrm like 'TEST FAILED:%' then raise; end if;
  if sqlerrm not like 'Attendance changed after submission%' then raise; end if;
 end;
 before_decision:=app_private.balance(student);
 perform public.rmc_review_attendance_correction(req,'rejected','Please resubmit against updated recording.',null,null);
 if app_private.balance(student)<>before_decision then raise exception 'Rejection changed balance'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','Resubmitting the verified arrival time.',proposed,null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_attendance_correction(req,'approved','Verified on-time attendance.',proposed,ends);
 if app_private.balance(student)<>balance_before-2 then raise exception 'Late to present did not reconcile penalty'; end if;
 -- A missing record can be added through review without touching unrelated sanctions.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(missing,'default','My attendance record is entirely missing.',proposed,null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_attendance_correction(req,'approved','Verified missing scan with officer.',proposed,null);
 if not exists(select 1 from public.rmc_attendance where event_id=missing and student_id=student and data->>'status'='present') then raise exception 'Missing record was not created'; end if;
 if app_private.balance(student)<>balance_before-2 then raise exception 'Missing record changed unrelated sanction'; end if;
 -- Corrections after service has cleared the balance must not refund completed
 -- work or deduct an old session penalty again from newly added sanctions.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(missing,'default','The missing session was actually absent.',null,null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 before_decision:=app_private.balance(student);
 perform public.rmc_review_attendance_correction(req,'approved','Officer verified non-attendance.',null,null);
 if app_private.balance(student)<>before_decision+2 then raise exception 'Present to absent did not add session penalty'; end if;
 perform app_private.sanction(student,-app_private.balance(student),'Simulated completed service',null,'service-test:'||missing);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(missing,'default','Officer found evidence of attendance.',proposed,null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_attendance_correction(req,'approved','Evidence verified after service.',proposed,null);
 if app_private.balance(student)<>0 or (select sanction_change from public.rmc_attendance_corrections where id=req)<>0 then raise exception 'Paid sanction correction created a refund'; end if;
 perform app_private.sanction(student,5,'New unrelated sanction',null,'new-unrelated:'||missing);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(missing,'default','Please correct my recorded time-out.',proposed,ends,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_attendance_correction(req,'approved','Verified the correct time-out.',proposed,ends);
 if (select (data->>'rendered_hours')::numeric from public.rmc_attendance where event_id=missing and student_id=student and slot='default')<>round(extract(epoch from (ends-proposed))/3600,6) then raise exception 'Corrected rendered time is inaccurate'; end if;
 if app_private.balance(student)<>5 then raise exception 'Repeated correction deducted unrelated new sanctions'; end if;
 if has_table_privilege('anon','public.rmc_attendance_corrections','select')
 or has_function_privilege('anon','public.rmc_correction_options()','execute') then raise exception 'Anonymous access is granted'; end if;
 -- Account freezes are checked by RPCs even without the REST pre-request hook.
 insert into public.rmc_account_freezes(account_id,reason,frozen_by,frozen_by_name) values(student,'Test freeze',reviewer,'Test admin');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 begin
  perform public.rmc_correction_options();
  raise exception 'TEST FAILED: frozen account accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: ownership, scoped review, direct-write denial, anonymous denial, duplicate prevention, time validation, stale protection, rejection, resubmission, missing records, exact sanctions, history, notifications, audit and freezes' as result;
