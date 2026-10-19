-- Student enrollment identities must be unique across all accounts.
-- Names are compared case-insensitively after trimming surrounding whitespace,
-- matching the normalization performed by the signup trigger.
create unique index if not exists rmc_profile_name_idx
  on public.rmc_profiles (lower(trim(profile->>'name')));

-- Keep the preflight response useful for staff-created accounts. The unique
-- indexes remain the final concurrency-safe guard for every write path.
create or replace function app_private.provision_check(person jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.rmc_profiles:=app_private.actor();
  p jsonb;
  n text;
  r text;
  kind text;
begin
  if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
  p:=person;
  n:=coalesce(p#>>'{official_data,assignment_node_id}',p#>>'{school_data,academic_assignment,terminalGroupId}');
  r:=coalesce(p->>'role','student');
  perform app_private.assert_permission(case when r='student' then 'directory.manage_members' else 'system.manage_accounts' end,n);
  if r not in ('student','mayor','ssg','ossa','ossa_staff') then raise exception 'Invalid account role.'; end if;
  if a.role_id<>'admin' and (r in ('ossa','ossa_staff') or (a.role_id='ssg' and r='ssg')) then raise exception 'You cannot create an account with this level of access.'; end if;
  select data->>'type' into kind from public.rmc_nodes where id=n;
  if (r in ('student','mayor') and kind not in ('section','block')) or (r in ('ossa','ossa_staff') and kind<>'campus') or (r='ssg' and kind='campus') then raise exception 'This role cannot be assigned to this unit.'; end if;
  if coalesce(trim(p->>'name'),'')='' then raise exception 'Name is required.'; end if;
  if exists(select 1 from public.rmc_profiles where lower(trim(profile->>'name'))=lower(trim(p->>'name')) or lower(profile->>'email')=lower(p->>'email') or lower(profile->>'username')=lower(p->>'username') or lower(profile->>'student_id')=lower(p->>'student_id')) then
    raise exception 'Name, email, username, or student ID already exists.';
  end if;
  return app_private.assign_profile(p,n,r<>'student');
end $$;

create or replace function app_private.on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := new.raw_user_meta_data->'profile';
  n text;
  secret text;
  provisioned boolean;
  errors jsonb;
begin
  provisioned:=exists(select 1 from app_private.provision_reservations where email=lower(new.email) and created_at>now()-interval '5 minutes');
  if p is null then raise exception 'Complete the admission form to create an account.'; end if;
  p:=jsonb_build_object('uid',new.id,'name',trim(p->>'name'),'username',lower(trim(p->>'username')),
    'email',lower(new.email),'student_id',trim(p->>'student_id'),'role','student','account_status','pending',
    'photo_url',coalesce(p->>'photo_url',''),'phone',p->>'phone','guardian',p->'guardian','school_data',coalesce(p->'school_data','{}'));
  if coalesce(p->>'name','')='' or coalesce(p->>'username','') !~ '^[a-z0-9_.-]{3,100}$' or coalesce(p->>'student_id','')='' then raise exception 'Name, student ID, and a valid username are required.'; end if;
  if exists(select 1 from public.rmc_profiles where lower(trim(profile->>'name'))=lower(trim(p->>'name')) or lower(profile->>'email')=lower(p->>'email') or lower(profile->>'username')=lower(p->>'username') or lower(profile->>'student_id')=lower(p->>'student_id')) then
    raise exception 'Name, email, username, or student ID already exists.';
  end if;
  n:=p#>>'{school_data,academic_assignment,terminalGroupId}';
  if not provisioned then
    errors:=app_private.enrollment_errors(p,new.raw_user_meta_data->>'enrollment_key',4,null);
    if errors<>'{}'::jsonb then raise exception '%', (select string_agg(value,' ') from jsonb_each_text(errors)); end if;
    p:=app_private.assign_profile(p,n);
    if app_private.frozen(n) then raise exception 'Enrollment is frozen for this unit.'; end if;
    select enrollment_key_hash into secret from public.rmc_nodes where id=n;
    if secret is not null and extensions.crypt(upper(trim(coalesce(new.raw_user_meta_data->>'enrollment_key',''))),secret) <> secret then raise exception 'Invalid section enrollment key.'; end if;
  end if;
  insert into public.rmc_profiles(id,profile,node_id) values(new.id,p,n);
  insert into public.rmc_applications(id,data) values(new.id,jsonb_build_object('id',new.id,'status','pending','submission_date',extract(epoch from now())*1000,'rejection_count',0,'form_data',p,'documents',case when not provisioned then jsonb_build_object('photo',p->>'photo_url') else '{}'::jsonb end));
  return new;
end $$;
