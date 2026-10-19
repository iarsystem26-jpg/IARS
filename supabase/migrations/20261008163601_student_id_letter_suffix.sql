-- Student IDs: four year digits, a hyphen, five numbers, and one letter.
-- Existing IDs are left intact; new enrollment and provisioning enforce the format.
begin;

create or replace function app_private.enrollment_errors(person jsonb, enrollment_key text, phase integer, exclude_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare errors jsonb:='{}'; n text; secret text; assigned jsonb;
begin
 if phase not between 1 and 4 then raise exception 'Invalid enrollment step.'; end if;
 if length(trim(coalesce(person->>'name',''))) not between 2 and 200 then errors:=errors||'{"name":"Enter your full name (2–200 characters)."}'; end if;
 if coalesce(person->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then errors:=errors||'{"email":"Enter a valid email address."}'; end if;
 if coalesce(person->>'username','')<>'' and person->>'username' !~ '^[a-zA-Z0-9_.-]{3,100}$' then errors:=errors||'{"username":"Username must be 3–100 letters, numbers, dots, underscores, or hyphens."}'; end if;
 if exists(select 1 from public.rmc_profiles where id is distinct from exclude_id and lower(trim(profile->>'name'))=lower(trim(person->>'name'))) then errors:=errors||'{"name":"This name is already registered. Sign in or contact your school officer."}'; end if;
 if exists(select 1 from public.rmc_profiles where id is distinct from exclude_id and lower(profile->>'username')=lower(trim(person->>'username'))) then errors:=errors||'{"username":"This username is already registered."}'; end if;
 if exists(select 1 from public.rmc_profiles where id is distinct from exclude_id and lower(profile->>'email')=lower(trim(person->>'email'))) then errors:=errors||'{"email":"This email address is already registered. Please sign in."}'; end if;
 if phase>=2 then
  if coalesce(trim(person->>'student_id'),'') !~ '^[0-9]{4}-[0-9]{5}[a-zA-Z]$' then errors:=errors||'{"student_id":"Use Student ID format YYYY-XXXXXL: four year digits, five numbers, and one letter (for example 2025-00046A)."}'; end if;
  if exists(select 1 from public.rmc_profiles where id is distinct from exclude_id and lower(profile->>'student_id')=lower(trim(person->>'student_id'))) then errors:=errors||'{"student_id":"This Student ID is already registered."}'; end if;
  n:=person#>>'{school_data,academic_assignment,terminalGroupId}';
  begin assigned:=app_private.assign_profile(person,n);
   if app_private.frozen(n) then errors:=errors||'{"section":"Enrollment is frozen for this section."}'; end if;
  exception when others then errors:=errors||jsonb_build_object('section',sqlerrm); end;
  select enrollment_key_hash into secret from public.rmc_nodes where id=n;
  if secret is not null and (coalesce(trim(enrollment_key),'')='' or extensions.crypt(upper(trim(enrollment_key)),secret)<>secret) then
   errors:=errors||'{"enrollment_key":"Incorrect enrollment key. Ask your class mayor or school officer for the correct key."}';
  end if;
 end if;
 if phase>=3 then
  if length(trim(coalesce(person#>>'{guardian,name}',''))) not between 2 and 200 then errors:=errors||'{"guardian":"Enter the emergency contact’s full name."}'; end if;
  if regexp_replace(coalesce(person#>>'{guardian,contact}',''),'[[:space:]()-]','','g') !~ '^(09[0-9]{9}|[+]639[0-9]{9})$' then errors:=errors||'{"guardian_contact":"Enter a valid Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX."}'; end if;
 end if;
 if phase=4 and coalesce(person->>'photo_url','') !~ '^https://drive[.]google[.]com/thumbnail[?]id=[A-Za-z0-9_-]+[&]sz=w1600$' then errors:=errors||'{"photo":"Upload your profile picture before registering."}'; end if;
 return errors;
end $$;
revoke all on function app_private.enrollment_errors(jsonb,text,integer,uuid) from public,anon,authenticated;


create or replace function app_private.lookup_enrollment(lookup_student_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb; full_name text; email text;
begin
  if lookup_student_id is null or trim(lookup_student_id) !~ '^[0-9]{4}-[0-9]{5}[a-zA-Z]$' then return jsonb_build_object('found', false); end if;
  select trim(a.data#>>'{form_data,name}'), lower(trim(a.data#>>'{form_data,email}')) into full_name, email
  from public.rmc_applications a
  where lower(trim(a.data#>>'{form_data,student_id}')) = lower(trim(lookup_student_id))
  order by (a.data->>'submission_date')::numeric desc nulls last limit 1;
  if full_name is not null then
    select jsonb_build_object('found', true, 'status', a.data->>'status', 'submittedAt', (a.data->>'submission_date')::numeric, 'reviewedAt', (a.data->>'reviewed_at')::numeric, 'rejectionReason', nullif(a.data->>'rejection_reason', ''), 'clarificationFields', coalesce(a.data->'clarification_fields', '[]'::jsonb), 'namePreview', left(full_name, least(12, length(full_name))) || case when length(full_name)>12 then '…' else '' end, 'emailPreview', case when position('@' in email)>2 then left(email, 2) || '•••' || substring(email from position('@' in email)) else '•••' end, 'sectionPreview', coalesce(nullif(a.data#>>'{form_data,school_data,section}', ''), nullif(a.data#>>'{form_data,school_data,academic_assignment,terminalGroupId}', ''), 'Unassigned')) into result
    from public.rmc_applications a where lower(trim(a.data#>>'{form_data,student_id}')) = lower(trim(lookup_student_id)) order by (a.data->>'submission_date')::numeric desc nulls last limit 1;
    return result;
  end if;
  select jsonb_build_object('found', true, 'status', 'approved', 'namePreview', left(trim(p.profile->>'name'), 12) || case when length(trim(p.profile->>'name'))>12 then '…' else '' end, 'emailPreview', '•••', 'sectionPreview', 'Enrolled') into result from public.rmc_profiles p where lower(trim(p.profile->>'student_id')) = lower(trim(lookup_student_id)) and p.status = 'active' limit 1;
  return coalesce(result, jsonb_build_object('found', false));
end $$;
grant execute on function public.rmc_lookup_enrollment(text) to anon, authenticated;

revoke all on function app_private.lookup_enrollment(text) from public, anon, authenticated;

create or replace function app_private.provision_check(person jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.rmc_profiles := app_private.actor();
  assignment text := coalesce(person#>>'{official_data,assignment_node_id}', person#>>'{school_data,academic_assignment,terminalGroupId}');
  requested_role text := coalesce(person->>'role', 'student');
  kind text;
begin
  if actor.id is null then
    raise exception 'An active authenticated account is required.' using errcode = '42501';
  end if;
  if requested_role = 'admin' then
    if actor.role_id <> 'admin' then
      raise exception 'Only an administrator can create administrator accounts.';
    end if;
    perform app_private.assert_permission('system.manage_accounts', null, true);
  elsif requested_role in ('ossa', 'ossa_staff', 'ssg') then
    perform app_private.assert_permission('system.manage_accounts', assignment);
  else
    perform app_private.assert_permission('directory.manage_members', assignment);
  end if;
  if requested_role not in ('student', 'mayor', 'ssg', 'ossa', 'ossa_staff', 'admin') then
    raise exception 'Invalid account role.';
  end if;
  if requested_role in ('ossa', 'ossa_staff') and actor.role_id <> 'admin' then
    raise exception 'You cannot create an account with this level of access.';
  end if;
  if actor.role_id = 'ssg' and requested_role = 'ssg' then
    raise exception 'You cannot create an account with this level of access.';
  end if;
  if requested_role <> 'admin' then
    select data->>'type' into kind from public.rmc_nodes where id = assignment;
    if kind is null then raise exception 'Select a valid academic unit.'; end if;
    if requested_role in ('student', 'mayor') and kind not in ('section', 'block') then
      raise exception 'This role cannot be assigned to this unit.';
    end if;
  end if;
  if requested_role in ('student', 'mayor') and coalesce(trim(person->>'student_id'), '') !~ '^[0-9]{4}-[0-9]{5}[a-zA-Z]$' then
    raise exception 'Use Student ID format YYYY-XXXXXL: four year digits, five numbers, and one letter (for example 2025-00046A).';
  end if;
  if coalesce(trim(person->>'name'), '') = '' then raise exception 'Name is required.'; end if;
  if exists (
    select 1 from public.rmc_profiles
    where lower(profile->>'email') = lower(person->>'email')
       or lower(profile->>'username') = lower(person->>'username')
       or lower(profile->>'student_id') = lower(person->>'student_id')
  ) then
    raise exception 'Email, username, or student ID already exists.';
  end if;
  -- assign_profile validates the complete path (including archived ancestors)
  -- and derives the scope on the server. No limit is imposed per role or unit.
  return case when requested_role = 'admin' then person
    else app_private.assign_profile(person, assignment, requested_role <> 'student') end;
end;
$$;
revoke all on function app_private.provision_check(jsonb) from public, anon;
grant execute on function app_private.provision_check(jsonb) to authenticated;

commit;
