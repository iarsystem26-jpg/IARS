begin;
create table public.rmc_profile_requests (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.rmc_profiles(id) on delete cascade,
 student_name text not null, student_number text not null,
 kind text not null check(kind in ('edit','deletion')),
 changes jsonb not null, original jsonb not null,
 reason text not null check(length(trim(reason)) between 10 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references public.rmc_profiles(id) on delete set null,
 reviewer_name text, review_note text not null default ''
);
create unique index rmc_profile_requests_pending on public.rmc_profile_requests(student_id) where status='pending';
create index rmc_profile_requests_history on public.rmc_profile_requests(student_id,created_at desc);
alter table public.rmc_profile_requests enable row level security;
revoke all on public.rmc_profile_requests from anon,authenticated;
grant select on public.rmc_profile_requests to authenticated;
grant all on public.rmc_profile_requests to service_role;
create policy profile_request_read on public.rmc_profile_requests for select to authenticated using (
 exists(select 1 from app_private.actor() a where a.id is not null and
  (a.id=student_id or (a.role_id in ('admin','ossa','ossa_staff') and exists(
   select 1 from public.rmc_profiles p where p.id=student_id and app_private.in_scope(p.node_id)))))
);

create function app_private.profile_request_values(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('name',coalesce(p->>'name',''),'student_id',coalesce(p->>'student_id',''),
 'phone',coalesce(p->>'phone',''),'guardianName',coalesce(p#>>'{guardian,name}',''),
 'guardianContact',coalesce(p#>>'{guardian,contact}',''),'guardianEmail',coalesce(p#>>'{guardian,email}',''))
$$;

create function app_private.submit_profile_request(kind text, changes jsonb, reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); k text; v jsonb; baseline jsonb; before_values jsonb:='{}'; cleaned jsonb:='{}'; rid uuid;
begin
 if a.id is null or a.role_id not in ('student','mayor') then raise exception 'An active student account is required.' using errcode='42501'; end if;
 if app_private.frozen(a.node_id) then raise exception 'Profile requests are temporarily frozen.'; end if;
 if kind is null or kind not in ('edit','deletion') or changes is null or jsonb_typeof(changes)<>'object' or changes='{}'::jsonb then raise exception 'Choose information to change or delete.'; end if;
 if reason is null or length(trim(reason)) not between 10 and 2000 then raise exception 'Explain your request in 10 to 2000 characters.'; end if;
 select * into a from public.rmc_profiles where id=a.id for update;
 if exists(select 1 from public.rmc_profile_requests r where r.student_id=a.id and r.status='pending') then raise exception 'You already have a pending request. Wait for its decision.'; end if;
 baseline:=app_private.profile_request_values(a.profile);
 for k,v in select * from jsonb_each(changes) loop
  if k not in ('name','student_id','phone','guardianName','guardianContact','guardianEmail') or jsonb_typeof(v)<>'string' then raise exception 'Unsupported profile field.'; end if;
  if kind='deletion' and (k not in ('phone','guardianName','guardianContact','guardianEmail') or v<>to_jsonb(''::text)) then raise exception 'Only optional contact and guardian information can be deleted.'; end if;
  v:=to_jsonb(trim(v#>>'{}'));
  if length(v#>>'{}')>200 then raise exception 'Profile fields must be at most 200 characters.'; end if;
  if k='name' and length(v#>>'{}')<2 then raise exception 'Enter a valid full name.'; end if;
  if k='student_id' and v#>>'{}' !~ '^[0-9]{2}-[0-9]{4}-[0-9]{3}[A-Za-z]?$' then raise exception 'Use Student ID format YY-NNNN-NNN with an optional letter.'; end if;
  if v is distinct from baseline->k then
   cleaned:=cleaned||jsonb_build_object(k,v); before_values:=before_values||jsonb_build_object(k,baseline->k);
  end if;
 end loop;
 if cleaned='{}'::jsonb then raise exception 'No information has changed.'; end if;
 insert into public.rmc_profile_requests(student_id,student_name,student_number,kind,changes,original,reason)
 values(a.id,a.profile->>'name',a.profile->>'student_id',kind,cleaned,before_values,trim(reason)) returning id into rid;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select p.id,'profile-request:'||rid||':submitted','Student information request',
 (a.profile->>'name')||' submitted an information '||kind||' request.','/ssg/panel'
 from public.rmc_profiles p where p.status='active' and (p.role_id='admin' or
 (p.role_id in ('ossa','ossa_staff') and p.node_id=any(app_private.path(a.node_id))));
 return rid;
end $$;

create function app_private.review_profile_request(request_id uuid, decision text, note text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); r public.rmc_profile_requests; p public.rmc_profiles;
 k text; v jsonb; current_values jsonb; updated jsonb;
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
 if decision='approved' then
  current_values:=app_private.profile_request_values(p.profile); updated:=p.profile;
  for k,v in select * from jsonb_each(r.changes) loop
   if current_values->k is distinct from r.original->k then raise exception 'Student information changed after submission. Reject this request and ask for a new one.'; end if;
   if k='student_id' and exists(select 1 from public.rmc_profiles other where other.id<>p.id and lower(other.profile->>'student_id')=lower(v#>>'{}')) then raise exception 'This Student ID is already registered.'; end if;
   if k in ('name','student_id','phone') then updated:=updated||jsonb_build_object(k,v);
   else updated:=jsonb_set(updated,'{guardian}',coalesce(nullif(updated->'guardian','null'::jsonb),'{}'::jsonb)||jsonb_build_object(case k when 'guardianName' then 'name' when 'guardianContact' then 'contact' else 'email' end,v)); end if;
  end loop;
  update public.rmc_profiles set profile=updated where id=p.id;
  -- Keep the admission copy consistent, including approved deletions.
  update public.rmc_applications set data=jsonb_set(data,'{form_data}',updated) where id=p.id;
 end if;
 update public.rmc_profile_requests set status=decision,reviewed_at=now(),reviewed_by=a.id,
 reviewer_name=a.profile->>'name',review_note=trim(note) where id=r.id;
 insert into public.rmc_notifications(user_id,source,title,detail,path) values(p.id,'profile-request:'||r.id||':'||decision,
 'Information '||r.kind||' request '||decision,
 case when decision='approved' then case when r.kind='deletion' then 'Your selected optional information has been deleted. Your account and school records are retained. ' else 'Your approved information changes have been applied. ' end else 'Your information was not changed. ' end||trim(note),'/student/profile');
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'reviewProfileRequest',r.id::text,
 jsonb_build_object('actor_name',a.profile->>'name','target_name',r.student_name,'decision',decision,'kind',r.kind));
end $$;
create function public.rmc_submit_profile_request(kind text, changes jsonb, reason text) returns uuid
language sql security invoker set search_path='' as $$ select app_private.submit_profile_request(kind,changes,reason) $$;
create function public.rmc_review_profile_request(request_id uuid, decision text, note text) returns void
language sql security invoker set search_path='' as $$ select app_private.review_profile_request(request_id,decision,note) $$;
revoke all on function app_private.submit_profile_request(text,jsonb,text), app_private.review_profile_request(uuid,text,text),
 public.rmc_submit_profile_request(text,jsonb,text),public.rmc_review_profile_request(uuid,text,text) from public,anon;
grant execute on function app_private.submit_profile_request(text,jsonb,text), app_private.review_profile_request(uuid,text,text),
 public.rmc_submit_profile_request(text,jsonb,text),public.rmc_review_profile_request(uuid,text,text) to authenticated;

create function app_private.guard_student_profile_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor();
begin
 if a.id=old.id and a.role_id in ('student','mayor') and
 app_private.profile_request_values(new.profile) is distinct from app_private.profile_request_values(old.profile) then
  raise exception 'Submit an information request for OSSA or admin approval.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger student_profile_approval before update of profile on public.rmc_profiles
 for each row execute function app_private.guard_student_profile_changes();
revoke all on function app_private.guard_student_profile_changes() from public,anon,authenticated;
commit;
