-- Exercise real authorization and transfer behavior, then roll back every change.
begin;
do $$
declare student public.rmc_profiles; reviewer uuid; destination text; request_id uuid; before_balance numeric; after_profile public.rmc_profiles;
begin
 select * into strict student from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor')
 and p.node_id is not null and not app_private.frozen(p.node_id)
 and not exists(select 1 from public.rmc_profile_requests r where r.student_id=p.id and r.status='pending') limit 1;
 select id into strict reviewer from public.rmc_profiles where status='active' and role_id='admin' limit 1;
 select n.id into strict destination from public.rmc_nodes n where n.id<>student.node_id and n.data->>'type' in ('section','block')
 and not app_private.frozen(n.id)
 and not exists(select 1 from public.rmc_nodes parent where parent.id=any(app_private.path(n.id)) and parent.data#>>'{metadata,archived}'='true') limit 1;
 before_balance:=app_private.balance(student.id);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student.id,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student.id::text,true);
 begin
  perform public.rmc_submit_transfer_request(student.node_id,'Correct my class assignment');
  raise exception 'TEST FAILED: accepted current class';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 request_id:=public.rmc_submit_transfer_request(destination,'Correct my class assignment');
 if (select node_id from public.rmc_profiles where id=student.id) is distinct from student.node_id then raise exception 'Submission changed assignment'; end if;
 begin
  perform public.rmc_submit_transfer_request(destination,'Duplicate class transfer request');
  raise exception 'TEST FAILED: accepted duplicate';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.rmc_review_profile_request_fields(request_id,'approved','Self approval',null);
  raise exception 'TEST FAILED: accepted student approval';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_profile_request_fields(request_id,'rejected','Please verify enrollment',array['node_id']);
 if (select node_id from public.rmc_profiles where id=student.id) is distinct from student.node_id then raise exception 'Rejection changed assignment'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student.id,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',student.id::text,true);
 request_id:=public.rmc_submit_transfer_request(destination,'Correct my class assignment');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 update public.rmc_profile_requests set original=jsonb_build_object('node_id','stale-test-assignment') where id=request_id;
 begin
  perform public.rmc_review_profile_request_fields(request_id,'approved','Verified enrollment',null);
  raise exception 'TEST FAILED: accepted stale assignment';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if;
  if sqlerrm not like 'Student information changed%' then raise; end if; end;
 update public.rmc_profile_requests set original=jsonb_build_object('node_id',student.node_id) where id=request_id;
 perform public.rmc_review_profile_request_fields(request_id,'approved','Verified enrollment',null);
 select * into strict after_profile from public.rmc_profiles where id=student.id;
 if after_profile.node_id<>destination or after_profile.role_id<>'student' or after_profile.profile#>>'{school_data,academic_assignment,terminalGroupId}'<>destination then raise exception 'Approval did not transfer student'; end if;
 if after_profile.profile->>'name' is distinct from student.profile->>'name' or app_private.balance(student.id)<>before_balance then raise exception 'Transfer changed identity or balance'; end if;
 if (select status from public.rmc_profile_requests where id=request_id)<>'approved' then raise exception 'Request did not close'; end if;
 if not exists(select 1 from public.rmc_notifications where user_id=student.id and source like 'profile-request:'||request_id||':fields:%') then raise exception 'Student notification missing'; end if;
end $$;
rollback;
select 'PASS: submission, duplicate prevention, self-review denial, rejection, stale protection, approval, identity, balance and notification' as result;
