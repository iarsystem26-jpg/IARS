-- Validation returns only field errors, never another student's record.
create unique index if not exists rmc_profile_name_idx on public.rmc_profiles(lower(trim(profile->>'name')));

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
  if coalesce(trim(person->>'student_id'),'') !~ '^[0-9]{4}-[0-9]{5}$' then errors:=errors||'{"student_id":"Use Student ID format YYYY-NNNNN, for example 2025-00046."}'; end if;
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

create or replace function public.rmc_validate_enrollment(person jsonb, enrollment_key text default null, phase integer default 2)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.enrollment_errors(person,enrollment_key,phase,auth.uid())
$$;
revoke all on function public.rmc_validate_enrollment(jsonb,text,integer) from public;
grant execute on function public.rmc_validate_enrollment(jsonb,text,integer) to anon,authenticated;
