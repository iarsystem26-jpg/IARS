-- Credit-aware corrections run against isolated fixtures and roll back all writes.
begin;
do $$
declare student uuid; reviewer uuid; ev uuid:=gen_random_uuid(); merit uuid:=gen_random_uuid(); clear_ev uuid:=gen_random_uuid(); overlap_ev uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid(); req uuid;
 node text:='credit-correction-test-'||gen_random_uuid(); starts timestamptz:=date_trunc('day',now())-interval '2 days';
 plan jsonb; before_balance numeric; slot1 text; slot2 text; original jsonb; preserved jsonb; credited numeric;
begin
 select id into strict student from public.rmc_profiles where is_test_account and status='active' and role_id='student' limit 1;
 select id into strict reviewer from public.rmc_profiles where is_test_account and status='active' and role_id='admin' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 delete from public.rmc_account_freezes where account_id in (student,reviewer);
 insert into public.rmc_nodes(id,data) values(node,'{"name":"Credit correction test","type":"section"}');
 update public.rmc_profiles set node_id=node,created_at=starts-interval '1 day',profile=app_private.assign_profile(profile,node) where id=student;
 perform app_private.sanction(student,-app_private.balance(student),'Normalize rollback fixture');
 perform app_private.sanction(student,1,'Fixture outstanding sanction');
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 values(ev,reviewer,node,starts,starts+interval '2 hours',now(),jsonb_build_object('title','Service correction test','kind','service','status','done','penaltyValue',0,'penaltyUnit','hours','geofenceEnabled',false,
 'startTime',extract(epoch from starts)*1000,'endTime',extract(epoch from starts+interval '2 hours')*1000,
 'service',jsonb_build_object('overflow','merit'),'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)),'scopeNodeId',node));
 original:=jsonb_build_object('status','present','slot','default','time_in',extract(epoch from starts)*1000,'time_out',extract(epoch from starts+interval '2 hours')*1000,
 'rendered_hours',2,'deducted_hours',1,'merit_earned_hours',1,'awarded_hours',2);
 insert into public.rmc_attendance values(ev,student,'default',original);
 perform app_private.sanction(student,-1,'Original service',ev,'service:'||ev||':'||student||':default');
 select data into preserved from public.rmc_sanctions where source='service:'||ev||':'||student||':default';
 insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(student,ev,'service:'||ev||':'||student||':default',1,reviewer);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 execute 'set local role authenticated';
 if not exists(select 1 from jsonb_array_elements(public.rmc_correction_options()) where value->>'event_id'=ev::text and value->>'kind'='service') then raise exception 'Service session unavailable'; end if;
 req:=public.rmc_submit_attendance_correction(ev,'default','Officer confirmed service checkout was earlier.',starts,starts+interval '1 hour');
 execute 'reset role';
 if app_private.balance(student)<>0 then raise exception 'Submission changed credit'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 execute 'set local role authenticated';
 plan:=public.rmc_preview_correction_credit(req,starts,starts+interval '1 hour');
 if (plan->>'merit_change')::numeric<>-1 or (plan->>'sanction_change')::numeric<>0 then raise exception 'Merit-first reversal incorrect: %',plan; end if;
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Missing preview must fail',starts,starts+interval '1 hour');
  raise exception 'TEST FAILED: approval without preview accepted';
 exception when others then if sqlerrm not like 'Credit preview changed%' then raise; end if; end;
 perform public.rmc_review_attendance_correction(req,'approved','Verified earlier checkout',starts,starts+interval '1 hour',plan);
 execute 'reset role';
 if (select data from public.rmc_sanctions where source='service:'||ev||':'||student||':default') is distinct from preserved then raise exception 'Original sanction ledger was rewritten'; end if;
 if (select hours from public.rmc_merit_credits where source='service:'||ev||':'||student||':default')<>1 then raise exception 'Original merit was rewritten'; end if;
 if (select sum(hours) from public.rmc_merit_credits where student_id=student and event_id=ev)<>0 then raise exception 'Merit adjustment not appended'; end if;
 if (select c.original from public.rmc_attendance_corrections c where c.id=req) is distinct from original then raise exception 'Original recording history overwritten'; end if;
 -- Removing completed service restores cleared sanctions; a new award can clear them again.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','This service participation belongs to another student.',null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,null,null);
 if (plan->>'sanction_change')::numeric<>1 then raise exception 'Cleared sanction not restored'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified attendance belongs elsewhere',null,null,plan);
 if app_private.balance(student)<>1 then raise exception 'Restored balance incorrect'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','Officer confirmed my actual service participation.',starts,starts+interval '90 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts,starts+interval '90 minutes');
 if (plan->>'cleared_after')::numeric<>1 or (plan->>'merit_after')::numeric<>0.5 then raise exception 'Service increase allocation wrong: %',plan; end if;
 -- An unrelated balance change invalidates the preview but not the attendance request.
 perform app_private.sanction(student,2,'Unrelated balance change');
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Stale preview must fail',starts,starts+interval '90 minutes',plan);
  raise exception 'TEST FAILED: stale balance preview accepted';
 exception when others then if sqlerrm not like 'Credit preview changed%' then raise; end if; end;
 plan:=public.rmc_preview_correction_credit(req,starts,starts+interval '90 minutes');
 perform public.rmc_review_attendance_correction(req,'approved','Verified service participation',starts,starts+interval '90 minutes',plan);
 begin
  perform public.rmc_review_attendance_correction(req,'approved','Repeat approval must fail',starts,starts+interval '90 minutes',plan);
  raise exception 'TEST FAILED: repeated award accepted';
 exception when others then if sqlerrm not like 'This request has already been reviewed%' then raise; end if; end;
 -- A matching correction is idempotent even when there are new sanctions.
 before_balance:=app_private.balance(student);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','Confirming the same service times again.',starts,starts+interval '90 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts,starts+interval '90 minutes');
 if (plan->>'sanction_change')::numeric<>0 or (plan->>'merit_change')::numeric<>0 then raise exception 'Matching correction awards extra credit'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified unchanged participation',starts,starts+interval '90 minutes',plan);
 if app_private.balance(student)<>before_balance then raise exception 'Matching correction altered balance'; end if;
 -- Merit is awarded only when both daily windows are complete.
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 values(merit,reviewer,node,starts+interval '3 hours',starts+interval '6 hours',now(),jsonb_build_object('title','Merit correction test','kind','merit','status','done','penaltyValue',0,'penaltyUnit','hours','geofenceEnabled',false,
 'startTime',extract(epoch from starts+interval '3 hours')*1000,'endTime',extract(epoch from starts+interval '6 hours')*1000,'meritHours',2,
 'attendanceWindows','[{"id":"first","timeIn":"11:00","timeOut":"12:00","lateAfterMinutes":15},{"id":"second","timeIn":"13:00","timeOut":"14:00","lateAfterMinutes":15}]'::jsonb,
 'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)),'scopeNodeId',node));
 slot1:=(starts at time zone 'Asia/Manila')::date||':first'; slot2:=(starts at time zone 'Asia/Manila')::date||':second';
 insert into public.rmc_attendance values(merit,student,slot1,jsonb_build_object('status','present','time_in',extract(epoch from starts+interval '3 hours')*1000,'time_out',extract(epoch from starts+interval '4 hours')*1000,'rendered_hours',1));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(merit,slot2,'Officer verified my missing second session.',starts+interval '5 hours',starts+interval '6 hours');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '5 hours',null);
 if (plan->>'complete')::boolean or (plan->>'cleared_after')::numeric<>0 then raise exception 'Incomplete merit session released award'; end if;
 plan:=public.rmc_preview_correction_credit(req,starts+interval '5 hours',starts+interval '6 hours');
 if not(plan->>'complete')::boolean or (plan->>'cleared_after')::numeric<>1.5 or (plan->>'merit_after')::numeric<>0.5 then raise exception 'Completed merit did not award fixed hours: %',plan; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified missing second session',starts+interval '5 hours',starts+interval '6 hours',plan);
 if app_private.balance(student)<>0 then raise exception 'Merit did not clear remaining sanctions'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(merit,slot1,'The first session attendance was recorded incorrectly.',null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,null,null);
 if (plan->>'sanction_change')::numeric<>1.5 or (plan->>'merit_change')::numeric<>-0.5 or (plan->>'complete')::boolean then raise exception 'Incomplete merit did not reverse entire award'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified first session was absent',null,null,plan);
 if app_private.balance(student)<>1.5 then raise exception 'Merit reversal did not restore sanctions'; end if;
 if exists(select 1 from public.rmc_attendance where event_id=merit and student_id=student and (data->>'awarded_hours')::numeric>0) then raise exception 'Stale merit award displayed on another session'; end if;
 -- An offline update to another merit session makes the request stale.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(merit,slot1,'I attended and need my first session corrected.',starts+interval '3 hours',starts+interval '4 hours');
 update public.rmc_attendance set data=data||'{"offline_changed":true}' where event_id=merit and student_id=student and slot=slot2;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 begin
  perform public.rmc_preview_correction_credit(req,starts+interval '3 hours',starts+interval '4 hours');
  raise exception 'TEST FAILED: another-session stale request accepted';
 exception when others then if sqlerrm not like 'Attendance or credits changed after submission%' then raise; end if; end;
 perform public.rmc_review_attendance_correction(req,'rejected','Please resubmit against latest attendance',null,null);
 -- An overlapping completed service record blocks a new claim.
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 select overlap_ev,created_by,node_id,start_at,end_at,finalized_at,data||'{"title":"Overlapping service fixture"}' from public.rmc_events where id=ev;
 insert into public.rmc_attendance values(overlap_ev,student,'default',original);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(ev,'default','Officer confirmed a different service checkout time.',starts,starts+interval '1 hour');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 begin
  perform public.rmc_preview_correction_credit(req,starts,starts+interval '1 hour');
  raise exception 'TEST FAILED: overlapping participation accepted';
 exception when others then if sqlerrm not like 'Verified participation overlaps%' then raise; end if; end;
 -- Clear-only service must not reuse discarded overflow for new sanctions.
 perform app_private.sanction(student,-app_private.balance(student),'Normalize clear-only fixture');
 perform app_private.sanction(student,1,'Clear-only fixture sanction');
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 select clear_ev,created_by,node_id,starts+interval '8 hours',starts+interval '10 hours',finalized_at,
 data||jsonb_build_object('title','Clear-only service fixture','service',jsonb_build_object('overflow','clear'),
 'startTime',extract(epoch from starts+interval '8 hours')*1000,'endTime',extract(epoch from starts+interval '10 hours')*1000)
 from public.rmc_events where id=ev;
 insert into public.rmc_attendance values(clear_ev,student,'default',jsonb_build_object('status','present','time_in',extract(epoch from starts+interval '8 hours')*1000,
 'time_out',extract(epoch from starts+interval '10 hours')*1000,'rendered_hours',2,'awarded_hours',2,'deducted_hours',1,'merit_earned_hours',0));
 perform app_private.sanction(student,-1,'Original clear-only award',clear_ev,'service:'||clear_ev||':'||student||':default');
 perform app_private.sanction(student,3,'New unrelated sanctions');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(clear_ev,'default','Confirming the same clear-only service times.',starts+interval '8 hours',starts+interval '10 hours');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '8 hours',starts+interval '10 hours');
 if (plan->>'sanction_change')::numeric<>0 or (plan->>'merit_after')::numeric<>0 then raise exception 'Discarded service overflow reused'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified unchanged clear-only service',starts+interval '8 hours',starts+interval '10 hours',plan);
 -- Shortening and restoring previously discarded overflow cannot award it again.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(clear_ev,'default','Correcting the checkout to thirty minutes earlier.',starts+interval '8 hours',starts+interval '9 hours 30 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '8 hours',starts+interval '9 hours 30 minutes');
 perform public.rmc_review_attendance_correction(req,'approved','Verified earlier clear-only checkout',starts+interval '8 hours',starts+interval '9 hours 30 minutes',plan);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(clear_ev,'default','Restoring the verified original checkout time.',starts+interval '8 hours',starts+interval '10 hours');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '8 hours',starts+interval '10 hours');
 if (plan->>'sanction_change')::numeric<>0 then raise exception 'Shorten/restore cycle reused discarded credit'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified restored original checkout',starts+interval '8 hours',starts+interval '10 hours',plan);
 -- An open corrected session earns zero; a delayed checkout may change its rendered
 -- duration without earning credit because the scanner award key was reserved.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(clear_ev,'default','Checkout was never completed for this service.',starts+interval '8 hours',null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '8 hours',null);
 perform public.rmc_review_attendance_correction(req,'approved','Verified service remains open',starts+interval '8 hours',null,plan);
 update public.rmc_attendance set data=data||jsonb_build_object('time_out',extract(epoch from starts+interval '9 hours 30 minutes')*1000,'rendered_hours',1.5,'awarded_hours',0)
 where event_id=clear_ev and student_id=student;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(clear_ev,'default','The synchronized checkout still needs credit review.',starts+interval '8 hours',starts+interval '9 hours 30 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '8 hours',starts+interval '9 hours 30 minutes');
 if (plan->>'cleared_after')::numeric<>1 then raise exception 'Delayed offline checkout cannot receive missing service credit: %',plan; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified synchronized checkout credit',starts+interval '8 hours',starts+interval '9 hours 30 minutes',plan);
 -- A newly corrected missing check-in followed by delayed offline checkout
 -- can receive credit even when rendered time was already synchronized.
 insert into public.rmc_events(id,created_by,node_id,start_at,end_at,finalized_at,data)
 select fresh,created_by,node_id,starts+interval '11 hours',starts+interval '13 hours',finalized_at,
 data||jsonb_build_object('title','Missing service fixture','startTime',extract(epoch from starts+interval '11 hours')*1000,'endTime',extract(epoch from starts+interval '13 hours')*1000)
 from public.rmc_events where id=clear_ev;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(fresh,'default','The check-in is missing and checkout is not yet verified.',starts+interval '11 hours',null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '11 hours',null);
 perform public.rmc_review_attendance_correction(req,'approved','Verified missing check-in only',starts+interval '11 hours',null,plan);
 update public.rmc_attendance set data=data||jsonb_build_object('time_out',extract(epoch from starts+interval '12 hours')*1000,'rendered_hours',1,'awarded_hours',0)
 where event_id=fresh and student_id=student;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 req:=public.rmc_submit_attendance_correction(fresh,'default','The offline checkout synchronized but credit is missing.',starts+interval '11 hours',starts+interval '12 hours');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',reviewer::text,true);
 plan:=public.rmc_preview_correction_credit(req,starts+interval '11 hours',starts+interval '12 hours');
 if (plan->>'cleared_after')::numeric<>1 then raise exception 'Missing offline credit cannot be awarded'; end if;
 perform public.rmc_review_attendance_correction(req,'approved','Verified completed synchronized service',starts+interval '11 hours',starts+interval '12 hours',plan);
 if has_function_privilege('authenticated','app_private.review_institutional_attendance_correction(uuid,text,text,timestamptz,timestamptz)','execute') then raise exception 'Legacy private review bypass remains accessible'; end if;
 if has_function_privilege('anon','public.rmc_preview_correction_credit(uuid,timestamptz,timestamptz)','execute') then raise exception 'Anonymous credit preview accessible'; end if;
end $$;
rollback;
select 'PASS: signed immutable ledgers, merit-first reversal, restored sanctions, service increases, unchanged correction idempotence, required previews, stale balance/attendance protection, full-session fixed merit, rejection, overlap protection, discarded overflow, shorten/restore cycles, delayed offline checkout and restricted RPCs' as result;
