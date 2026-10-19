begin;
alter table public.rmc_profile_requests add column field_decisions jsonb not null default '{}'::jsonb;
alter table public.rmc_profile_requests drop constraint rmc_profile_requests_status_check;
alter table public.rmc_profile_requests add constraint rmc_profile_requests_status_check check(status in ('pending','approved','rejected','partially_approved'));
-- Backfill completed requests so their decisions remain immutable.
update public.rmc_profile_requests r set field_decisions=(select jsonb_object_agg(k,
 jsonb_build_object('status',r.status,'note',r.review_note,'reviewed_at',r.reviewed_at,'reviewer_name',r.reviewer_name,'reviewed_by',r.reviewed_by))
 from jsonb_object_keys(r.changes) k) where status in ('approved','rejected');

create function app_private.review_profile_request_fields(request_id uuid, decision text, note text, fields text[] default null) returns void
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
 current_values:=app_private.profile_request_values(p.profile); updated:=p.profile;
 foreach k in array chosen loop
  if not r.changes ? k then raise exception 'This field was not requested.'; end if;
  if decisions ? k then raise exception 'This change has already been reviewed. Refresh the request.'; end if;
  v:=r.changes->k;
  if decision='approved' then
   if current_values->k is distinct from r.original->k then raise exception 'Student information changed after submission. Reject this request and ask for a new one.'; end if;
   if k='student_id' and exists(select 1 from public.rmc_profiles other where other.id<>p.id and lower(other.profile->>'student_id')=lower(v#>>'{}')) then raise exception 'This Student ID is already registered.'; end if;
   if k in ('name','student_id','phone') then updated:=updated||jsonb_build_object(k,v);
   else updated:=jsonb_set(updated,'{guardian}',coalesce(nullif(updated->'guardian','null'::jsonb),'{}'::jsonb)||jsonb_build_object(case k when 'guardianName' then 'name' when 'guardianContact' then 'contact' else 'email' end,v)); end if;
  end if;
  decisions:=decisions||jsonb_build_object(k,jsonb_build_object('status',decision,'note',trim(note),'reviewed_at',clock_timestamp(),'reviewer_name',a.profile->>'name','reviewed_by',a.id));
  labels:=array_append(labels,case k when 'name' then 'Full name' when 'student_id' then 'Student ID' when 'phone' then 'Mobile contact' when 'guardianName' then 'Guardian name' when 'guardianContact' then 'Guardian contact' else 'Guardian email' end);
 end loop;
 if decision='approved' then
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
 'Information '||r.kind||': '||decision,
 array_to_string(labels,', ')||' — '||decision||'. '||
 case when decision='approved' then case when r.kind='deletion' then 'The selected optional information has been deleted. Your account and school records are retained. ' else 'The approved changes have been applied. ' end else 'These fields were not changed. ' end||trim(note)||
 case when pending_count>0 then ' Other changes are still pending review.' else ' All changes have been reviewed.' end,'/student/profile');
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'reviewProfileRequest',r.id::text,
 jsonb_build_object('actor_name',a.profile->>'name','target_name',r.student_name,'decision',decision,'kind',r.kind,'fields',to_jsonb(chosen),'request_status',summary_status));
end $$;

-- The original API remains compatible and reviews all remaining fields.
create or replace function app_private.review_profile_request(request_id uuid, decision text, note text) returns void
language sql security invoker set search_path='' as $$ select app_private.review_profile_request_fields(request_id,decision,note,null) $$;
create function public.rmc_review_profile_request_fields(request_id uuid, decision text, note text, fields text[] default null) returns void
language sql security invoker set search_path='' as $$ select app_private.review_profile_request_fields(request_id,decision,note,fields) $$;
revoke all on function app_private.review_profile_request_fields(uuid,text,text,text[]),public.rmc_review_profile_request_fields(uuid,text,text,text[]) from public,anon;
grant execute on function app_private.review_profile_request_fields(uuid,text,text,text[]),public.rmc_review_profile_request_fields(uuid,text,text,text[]) to authenticated;

-- Redact only approved deletions, including approvals before the request closes.
drop trigger redact_deleted_profile_request on public.rmc_profile_requests;
create or replace function app_private.redact_deleted_profile_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;
begin
 if new.kind='deletion' then
  for field in select jsonb_object_keys(new.changes) loop
   if new.field_decisions#>>array[field,'status']='approved' and old.field_decisions#>>array[field,'status'] is distinct from 'approved' then
    new.original:=jsonb_set(new.original,array[field],to_jsonb(''::text));
    update public.rmc_profile_requests set
     original=case when original ? field then jsonb_set(original,array[field],to_jsonb(''::text)) else original end,
     changes=case when changes ? field then jsonb_set(changes,array[field],to_jsonb(''::text)) else changes end
    where student_id=new.student_id and id<>new.id;
   end if;
  end loop;
 end if;
 return new;
end $$;
create trigger redact_deleted_profile_request before update of field_decisions on public.rmc_profile_requests
 for each row execute function app_private.redact_deleted_profile_request();
create or replace function app_private.profile_request_notice_path() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.source like 'profile-request:%:submitted' and exists(select 1 from public.rmc_profiles where id=new.user_id and role_id in ('ossa','ossa_staff')) then
  new.path:='/ossa/dashboard/requests';
 end if;
 return new;
end $$;
commit;
