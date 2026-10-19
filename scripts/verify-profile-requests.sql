-- Run on the connected development project. All fixture changes roll back.
begin;
select set_config('test.student',(select id::text from public.rmc_profiles where is_test_account and role_id='student' limit 1),true);
select set_config('test.admin',(select id::text from public.rmc_profiles where is_test_account and role_id='admin' limit 1),true);
select set_config('test.ossa',(select id::text from public.rmc_profiles where is_test_account and role_id='ossa' limit 1),true);
select set_config('test.other',(select id::text from public.rmc_profiles where is_test_account and role_id='mayor' limit 1),true);
do $$ begin
 if nullif(current_setting('test.student'),'') is null or nullif(current_setting('test.admin'),'') is null or nullif(current_setting('test.ossa'),'') is null then raise exception 'Demo student, admin and OSSA accounts required.'; end if;
end $$;
update public.rmc_settings set data='{"isFrozen":false}' where id='system_freeze';
update public.rmc_settings set data='{}' where id='frozen_nodes';
update public.rmc_profiles set node_id=(select node_id from public.rmc_profiles where id=current_setting('test.ossa')::uuid) where id=current_setting('test.student')::uuid;
delete from public.rmc_profile_requests where student_id=current_setting('test.student')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
do $$ declare rid uuid; begin
 begin
  perform public.rmc_submit_profile_request('edit','{"student_id":"26-0001-001"}','Invalid format student ID correction');
  raise exception 'Incorrect Student ID format allowed';
 exception when raise_exception then if sqlerrm not like 'Use Student ID format YYYY-NNNNNL%' then raise; end if; end;
 rid:=public.rmc_submit_profile_request('edit','{"student_id":"2099-99999Z"}','Valid format student ID correction');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
 perform public.rmc_review_profile_request(rid,'approved','Verified student ID correction');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
 if (select profile->>'student_id' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'2099-99999Z' then raise exception 'Student ID change not applied'; end if;
end $$;
do $$ declare rid uuid; begin
 begin
  perform public.rmc_command('updateContactDetails',jsonb_build_array(current_setting('test.student'),jsonb_build_object('phone','bypass')));
  raise exception 'Direct student update was allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.rmc_submit_profile_request('edit','{"role":"admin"}','Attempt privileged modification');
  raise exception 'Role edit was allowed';
 exception when raise_exception then if sqlerrm='Role edit was allowed' then raise; end if; end;
 begin
  perform public.rmc_submit_profile_request('deletion','{"name":""}','Attempt required identity deletion');
  raise exception 'Identity deletion was allowed';
 exception when raise_exception then if sqlerrm='Identity deletion was allowed' then raise; end if; end;
 rid:=public.rmc_submit_profile_request('edit','{"phone":"request-integration-test"}','Correct optional contact information');
 perform set_config('test.request',rid::text,true);
 if (select count(*) from public.rmc_profile_requests where id=rid)<>1 then raise exception 'Student cannot read own request'; end if;
 begin
  perform public.rmc_submit_profile_request('edit','{"phone":"duplicate-test"}','Duplicate optional contact request');
  raise exception 'Duplicate pending request allowed';
 exception when raise_exception then if sqlerrm='Duplicate pending request allowed' then raise; end if; end;
 begin
  perform public.rmc_review_profile_request(rid,'approved','Self approval');
  raise exception 'Student self approval allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.rmc_profile_requests set status='approved' where id=rid;
  raise exception 'Direct request mutation allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.other'),'aal','aal2')::text,true);
do $$ begin
 if exists(select 1 from public.rmc_profile_requests where id=current_setting('test.request')::uuid) then raise exception 'Another student can read private request'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ossa'),'aal','aal2')::text,true);
do $$ begin
 if not exists(select 1 from public.rmc_profile_requests where id=current_setting('test.request')::uuid) then raise exception 'Scoped OSSA cannot read request'; end if;
 perform public.rmc_review_profile_request(current_setting('test.request')::uuid,'approved','Verified optional contact change');
 begin
  perform public.rmc_review_profile_request(current_setting('test.request')::uuid,'rejected','Repeated review');
  raise exception 'Repeated review allowed';
 exception when raise_exception then if sqlerrm='Repeated review allowed' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'request-integration-test' then raise exception 'Approved edit not applied'; end if;
 if not exists(select 1 from public.rmc_notifications where user_id=current_setting('test.student')::uuid and source like 'profile-request:'||current_setting('test.request')||':fields:%' and title like '%approved') then raise exception 'Approval notification missing'; end if;
 if not exists(select 1 from public.rmc_notifications where user_id=current_setting('test.ossa')::uuid and source='profile-request:'||current_setting('test.request')||':submitted' and path='/ossa/dashboard/requests') then raise exception 'OSSA queue notification missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
select set_config('test.deletion',public.rmc_submit_profile_request('deletion','{"phone":""}','Please remove optional contact information')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
select public.rmc_review_profile_request(current_setting('test.deletion')::uuid,'approved','Deleted optional contact information');
reset role;
do $$ begin
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'' then raise exception 'Optional information was not deleted'; end if;
 if exists(select 1 from public.rmc_profile_requests where student_id=current_setting('test.student')::uuid and (original->>'phone'='request-integration-test' or changes->>'phone'='request-integration-test')) then raise exception 'Deleted value retained in request history'; end if;
 if not exists(select 1 from public.rmc_profiles where id=current_setting('test.student')::uuid and status='active') then raise exception 'Deletion removed account'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
select set_config('test.rejected',public.rmc_submit_profile_request('edit','{"phone":"must-not-apply"}','Please update optional phone information')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
select public.rmc_review_profile_request(current_setting('test.rejected')::uuid,'rejected','Unable to verify correction');
reset role;
do $$ begin
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'' then raise exception 'Rejected changes were applied'; end if;
 if not exists(select 1 from public.rmc_notifications where user_id=current_setting('test.student')::uuid and source like 'profile-request:'||current_setting('test.rejected')||':fields:%' and title like '%rejected') then raise exception 'Rejection notification missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
do $$ declare rid uuid; guardian_before text; begin
 select profile#>>'{guardian,name}' into guardian_before from public.rmc_profiles where id=current_setting('test.student')::uuid;
 rid:=public.rmc_submit_profile_request('edit','{"phone":"partial-phone-test","guardianName":"partial-guardian-test"}','Review these two corrections independently');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
 begin
  perform public.rmc_review_profile_request_fields(rid,'approved','Invalid selection',array['role']);
  raise exception 'Unrequested field was allowed';
 exception when raise_exception then if sqlerrm<>'This field was not requested.' then raise; end if; end;
 begin
  perform public.rmc_review_profile_request_fields(rid,'approved','Empty selection','{}'::text[]);
  raise exception 'Empty selection was allowed';
 exception when raise_exception then if sqlerrm<>'Choose at least one pending change.' then raise; end if; end;
 perform public.rmc_review_profile_request_fields(rid,'approved','Phone verified',array['phone']);
 if (select status from public.rmc_profile_requests where id=rid)<>'pending' then raise exception 'Partial request closed too soon'; end if;
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'partial-phone-test' then raise exception 'Individual approved field not applied'; end if;
 if (select profile#>>'{guardian,name}' from public.rmc_profiles where id=current_setting('test.student')::uuid) is distinct from guardian_before then raise exception 'Unreviewed field was changed'; end if;
 begin
  perform public.rmc_review_profile_request_fields(rid,'rejected','Cannot revise decision',array['phone']);
  raise exception 'Completed field could be revised';
 exception when raise_exception then if sqlerrm not like 'This change has already been reviewed.%' then raise; end if; end;
 perform public.rmc_review_profile_request_fields(rid,'rejected','Remaining correction unverified',null);
 if (select status from public.rmc_profile_requests where id=rid)<>'partially_approved' then raise exception 'Mixed final status incorrect'; end if;
 if (select field_decisions#>>'{phone,status}' from public.rmc_profile_requests where id=rid)<>'approved' then raise exception 'Bulk action changed earlier decision'; end if;
 if (select profile#>>'{guardian,name}' from public.rmc_profiles where id=current_setting('test.student')::uuid) is distinct from guardian_before then raise exception 'Rejected field applied'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
 if (select count(*) from public.rmc_notifications where user_id=current_setting('test.student')::uuid and source like 'profile-request:'||rid||':fields:%')<>2 then raise exception 'Partial decision notifications missing'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
 rid:=public.rmc_submit_profile_request('edit','{"phone":"bulk-phone-test","guardianName":"bulk-guardian-test"}','Approve these corrections together');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
 perform public.rmc_review_profile_request_fields(rid,'approved','Both corrections verified',null);
 if (select status from public.rmc_profile_requests where id=rid)<>'approved' then raise exception 'Bulk approval did not close request'; end if;
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'bulk-phone-test'
 or (select profile#>>'{guardian,name}' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'bulk-guardian-test' then raise exception 'Bulk approval did not apply every pending field'; end if;
 perform public.rmc_command('updateContactDetails',jsonb_build_array(current_setting('test.student'),jsonb_build_object('guardianName','retained-guardian-test')));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
 rid:=public.rmc_submit_profile_request('deletion','{"phone":"","guardianName":""}','Delete only verified optional fields');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
 perform public.rmc_review_profile_request_fields(rid,'approved','Remove phone only',array['phone']);
 if (select original->>'phone' from public.rmc_profile_requests where id=rid)<>'' then raise exception 'Partial deletion retained erased value'; end if;
 if (select original->>'guardianName' from public.rmc_profile_requests where id=rid)<>'retained-guardian-test' then raise exception 'Pending deletion was redacted'; end if;
 perform public.rmc_review_profile_request_fields(rid,'rejected','Guardian information must remain',array['guardianName']);
 if (select profile#>>'{guardian,name}' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'retained-guardian-test' then raise exception 'Rejected deletion removed information'; end if;
 if (select profile->>'phone' from public.rmc_profiles where id=current_setting('test.student')::uuid)<>'' then raise exception 'Partial deletion did not remove phone'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'aal','aal2')::text,true);
end $$;
select set_config('test.stale',public.rmc_submit_profile_request('edit','{"phone":"stale-value"}','Please update optional phone information')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'aal','aal2')::text,true);
select public.rmc_command('updateContactDetails',jsonb_build_array(current_setting('test.student'),jsonb_build_object('phone','newer-value')));
do $$ begin
 begin
  perform public.rmc_review_profile_request(current_setting('test.stale')::uuid,'approved','Approving stale correction');
  raise exception 'Stale approval was allowed';
 exception when raise_exception then if sqlerrm not like 'Student information changed after submission.%' then raise; end if; end;
end $$;
reset role;
update public.rmc_profiles set node_id=null where id=current_setting('test.ossa')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ossa'),'aal','aal2')::text,true);
do $$ begin
 if exists(select 1 from public.rmc_profile_requests where id=current_setting('test.stale')::uuid) then raise exception 'Out of scope request readable'; end if;
 begin
  perform public.rmc_review_profile_request(current_setting('test.stale')::uuid,'rejected','Out of scope review');
  raise exception 'Out of scope review allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform public.rmc_submit_profile_request('edit','{"phone":"anonymous"}','Anonymous contact correction');
  raise exception 'Anonymous submission allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
