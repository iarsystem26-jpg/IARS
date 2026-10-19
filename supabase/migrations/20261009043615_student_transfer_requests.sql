begin;
alter table public.rmc_profile_requests drop constraint rmc_profile_requests_kind_check;
alter table public.rmc_profile_requests add constraint rmc_profile_requests_kind_check check(kind in ('edit','deletion','transfer'));

create function app_private.submit_transfer_request(destination text, reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); rid uuid;
begin
 if a.id is null or a.role_id not in ('student','mayor') then raise exception 'An active student account is required.' using errcode='42501'; end if;
 if reason is null or length(trim(reason)) not between 10 and 2000 then raise exception 'Explain your request in 10 to 2000 characters.'; end if;
 select * into strict a from public.rmc_profiles where id=a.id for update;
 if app_private.frozen(a.node_id) or app_private.frozen(destination) then raise exception 'Transfer requests are temporarily frozen.'; end if;
 if destination is null or destination=a.node_id then raise exception 'Choose a different destination class.'; end if;
 perform app_private.assign_profile(a.profile,destination,false);
 if exists(select 1 from public.rmc_profile_requests r where r.student_id=a.id and r.status='pending') then raise exception 'You already have a pending request. Wait for its decision.'; end if;
 insert into public.rmc_profile_requests(student_id,student_name,student_number,kind,changes,original,reason)
 values(a.id,a.profile->>'name',a.profile->>'student_id','transfer',jsonb_build_object('node_id',destination),jsonb_build_object('node_id',coalesce(a.node_id,'')),trim(reason)) returning id into rid;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select p.id,'profile-request:'||rid||':submitted','Student transfer request',
 (a.profile->>'name')||' requested a class transfer.','/ssg/panel'
 from public.rmc_profiles p where p.status='active' and (p.role_id='admin' or
 (p.role_id in ('ossa','ossa_staff') and p.node_id=any(app_private.path(a.node_id))));
 return rid;
end $$;
create function public.rmc_submit_transfer_request(destination text, reason text) returns uuid
language sql security invoker set search_path='' as $$ select app_private.submit_transfer_request(destination,reason) $$;
revoke all on function app_private.submit_transfer_request(text,text),public.rmc_submit_transfer_request(text,text) from public,anon;
grant execute on function app_private.submit_transfer_request(text,text),public.rmc_submit_transfer_request(text,text) to authenticated;

create or replace function app_private.review_profile_request_fields(request_id uuid, decision text, note text, fields text[] default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); r public.rmc_profile_requests; p public.rmc_profiles;
 k text; v jsonb; current_values jsonb; updated jsonb; decisions jsonb; chosen text[]; pending_count int;
 approved_count int; rejected_count int; summary_status text; labels text[]:='{}';
begin
 if a.id is null or a.role_id not in ('admin','ossa','ossa_staff') then raise exception 'Only OSSA and administrators can review requests.' using errcode='42501'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 if note is null or length(trim(note)) not between 3 and 2000 then raise exception 'Provide a decision note in 3 to 2000 characters.'; end if;
 select * into strict r from public.rmc_profile_requests where id=request_id for update;
 select * into strict p from public.rmc_profiles where id=r.student_id for update;
 if a.id=p.id or not app_private.in_scope(p.node_id) then raise exception 'This request is outside your review scope.' using errcode='42501'; end if;
 perform app_private.assert_permission(case when a.role_id='admin' then 'directory.manage_members' else 'ossa.manage_cases' end,p.node_id);
 if r.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 if p.status<>'active' or p.role_id not in ('student','mayor') then raise exception 'This student account is no longer eligible.'; end if;
 decisions:=r.field_decisions;
 if fields is null then
  select array_agg(key order by key) into chosen from jsonb_object_keys(r.changes) key where not decisions ? key;
 else
  select array_agg(distinct field order by field) into chosen from unnest(fields) field;
 end if;
 if coalesce(cardinality(chosen),0)=0 then raise exception 'Choose at least one pending change.'; end if;
 if fields is not null and array_position(fields,null) is not null then raise exception 'Invalid field selection.'; end if;
 current_values:=app_private.profile_request_values(p.profile)||jsonb_build_object('node_id',coalesce(p.node_id,'')); updated:=p.profile;
 foreach k in array chosen loop
  if not r.changes ? k then raise exception 'This field was not requested.'; end if;
  if decisions ? k then raise exception 'This change has already been reviewed. Refresh the request.'; end if;
  v:=r.changes->k;
  if decision='approved' then
   if current_values->k is distinct from r.original->k then raise exception 'Student information changed after submission. Reject this request and ask for a new one.'; end if;
   if k='student_id' and exists(select 1 from public.rmc_profiles other where other.id<>p.id and lower(other.profile->>'student_id')=lower(v#>>'{}')) then raise exception 'This Student ID is already registered.'; end if;
   if r.kind='transfer' then
    if k<>'node_id' then raise exception 'Invalid transfer request.'; end if;
    perform app_private.transfer_students(jsonb_build_array(jsonb_build_object('uid',p.id,'student_id',p.profile->>'student_id','source_node_id',p.node_id,'destination_node_id',v#>>'{}')));
   elsif k in ('name','student_id','phone') then updated:=updated||jsonb_build_object(k,v);
   else updated:=jsonb_set(updated,'{guardian}',coalesce(nullif(updated->'guardian','null'::jsonb),'{}'::jsonb)||jsonb_build_object(case k when 'guardianName' then 'name' when 'guardianContact' then 'contact' else 'email' end,v)); end if;
  end if;
  decisions:=decisions||jsonb_build_object(k,jsonb_build_object('status',decision,'note',trim(note),'reviewed_at',clock_timestamp(),'reviewer_name',a.profile->>'name','reviewed_by',a.id));
  labels:=array_append(labels,case k when 'node_id' then 'Academic assignment' when 'name' then 'Full name' when 'student_id' then 'Student ID' when 'phone' then 'Mobile contact' when 'guardianName' then 'Guardian name' when 'guardianContact' then 'Guardian contact' else 'Guardian email' end);
 end loop;
 if decision='approved' and r.kind<>'transfer' then
  update public.rmc_profiles set profile=updated where id=p.id;
  update public.rmc_applications set data=jsonb_set(data,'{form_data}',updated) where id=p.id;
 end if;
 select count(*) filter(where not decisions ? key),
 count(*) filter(where decisions#>>array[key,'status']='approved'),
 count(*) filter(where decisions#>>array[key,'status']='rejected')
 into pending_count,approved_count,rejected_count from jsonb_object_keys(r.changes) key;
 summary_status:=case when pending_count>0 then 'pending' when approved_count=0 then 'rejected' when rejected_count=0 then 'approved' else 'partially_approved' end;
 update public.rmc_profile_requests set field_decisions=decisions,status=summary_status,reviewed_at=clock_timestamp(),
 reviewed_by=a.id,reviewer_name=a.profile->>'name',review_note=trim(note) where id=r.id;
 insert into public.rmc_notifications(user_id,source,title,detail,path) values(p.id,
 'profile-request:'||r.id||':fields:'||md5(array_to_string(chosen,',')),
 case when r.kind='transfer' then 'Transfer request: ' else 'Information '||r.kind||': ' end||decision,
 array_to_string(labels,', ')||' — '||decision||'. '||
 case when decision='approved' then case when r.kind='transfer' then 'Your approved class transfer has been applied. Attendance history and balances are retained. ' when r.kind='deletion' then 'The selected optional information has been deleted. Your account and school records are retained. ' else 'The approved changes have been applied. ' end else 'These fields were not changed. ' end||trim(note)||
 case when pending_count>0 then ' Other changes are still pending review.' else ' All changes have been reviewed.' end,'/student/profile');
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'reviewProfileRequest',r.id::text,
 jsonb_build_object('actor_name',a.profile->>'name','target_name',r.student_name,'decision',decision,'kind',r.kind,'fields',to_jsonb(chosen),'request_status',summary_status));
end $$;
commit;
