create or replace function app_private.submit_profile_request(kind text, changes jsonb, reason text) returns uuid
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
  if k='student_id' and v#>>'{}' !~ '^[0-9]{4}-[0-9]{5}[a-zA-Z]$' then raise exception 'Use Student ID format YYYY-NNNNNL (for example 2025-00046A).'; end if;
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

