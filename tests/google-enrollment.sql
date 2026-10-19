-- Run after the migration in one transaction; the caller must ROLLBACK.
do $$
declare
  e text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  ip text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  ticket text := encode(extensions.digest('verification-ticket', 'sha256'), 'hex');
  wait_seconds integer;
  i integer;
  test_email text := gen_random_uuid()::text || '@example.test';
  test_uid uuid := gen_random_uuid();
  campus text := 'google-verification-' || gen_random_uuid()::text;
  section text := 'google-verification-' || gen_random_uuid()::text;
  person jsonb;
begin
  if has_function_privilege('anon', 'public.rmc_enrollment_reserve(text,text,text)', 'execute') or has_function_privilege('authenticated', 'public.rmc_enrollment_reserve(text,text,text)', 'execute') then raise exception 'Public can reserve enrollment'; end if;
  if not has_function_privilege('service_role', 'public.rmc_enrollment_reserve(text,text,text)', 'execute') then raise exception 'Service cannot reserve enrollment'; end if;
  if public.rmc_enrollment_reserve(e, ip, ticket) <> 0 then raise exception 'First creation was blocked'; end if;
  wait_seconds := public.rmc_enrollment_reserve(e, ip, ticket);
  if wait_seconds < 1 or wait_seconds > 60 then raise exception 'Email cooldown failed: %', wait_seconds; end if;
  for i in 2..5 loop
    if public.rmc_enrollment_reserve(encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), ip, ticket) <> 0 then raise exception 'IP blocked before five creations'; end if;
  end loop;
  if public.rmc_enrollment_reserve(encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), ip, ticket) < 1 then raise exception 'IP creation limit bypassed'; end if;
  update app_private.enrollment_attempts set window_start = now() - interval '11 minutes' where key in ('email:' || e, 'ip:' || ip);
  if public.rmc_enrollment_reserve(e, ip, ticket) <> 0 then raise exception 'Cooldown never expires'; end if;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), test_email, '{}');
    raise exception 'Direct Auth signup bypassed enrollment';
  exception when others then
    if sqlerrm not like 'Complete enrollment before creating an account.%' then raise; end if;
  end;
  e := encode(extensions.digest(test_email, 'sha256'), 'hex');
  ip := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  perform public.rmc_enrollment_reserve(e, ip, ticket);
  update app_private.enrollment_tickets set expires_at = now() - interval '1 second' where email_hash = e;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), test_email, '{"enrollment_ticket":"verification-ticket"}');
    raise exception 'Expired ticket accepted';
  exception when others then
    if sqlerrm not like 'Complete enrollment before creating an account.%' then raise; end if;
  end;
  update app_private.enrollment_tickets set expires_at = now() + interval '1 minute' where email_hash = e;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), test_email, '{"enrollment_ticket":"verification-ticket"}');
    raise exception 'Incomplete enrollment accepted';
  exception when others then
    if sqlerrm <> 'Complete the admission form to create an account.' then raise; end if;
  end;
  if exists(select 1 from auth.users where email = test_email) then raise exception 'Rejected attempt left an Auth account'; end if;
  perform set_config('request.jwt.claim.sub', (select id::text from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select id::text from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1), 'role', 'authenticated')::text, true);
  insert into public.rmc_nodes(id, data) values (campus, '{"name":"Google verification campus","type":"campus"}');
  insert into public.rmc_nodes(id, parent_id, data) values (section, campus, '{"name":"Google verification section","type":"section"}');
  person := jsonb_build_object('name', 'Google verification ' || test_uid::text, 'username', 'google_' || replace(test_uid::text, '-', ''),
    'email', test_email, 'student_id', '9999-' || lpad((floor(random() * 100000))::integer::text, 5, '0'),
    'guardian', jsonb_build_object('name', 'Test Guardian', 'contact', '09123456789'),
    'photo_url', 'https://drive.google.com/thumbnail?id=googleverification&sz=w1600',
    'school_data', jsonb_build_object('academic_assignment', jsonb_build_object('terminalGroupId', section)));
  insert into auth.users(id, email, raw_user_meta_data) values (test_uid, test_email, jsonb_build_object('profile', person, 'enrollment_ticket', 'verification-ticket'));
  if not exists(select 1 from public.rmc_profiles where id = test_uid and status = 'pending')
    or not exists(select 1 from public.rmc_applications where id = test_uid and data->>'status' = 'pending') then raise exception 'Complete enrollment did not create pending application'; end if;
  if exists(select 1 from app_private.enrollment_tickets where email_hash = e) then raise exception 'Ticket was not consumed'; end if;
  insert into app_private.enrollment_tickets values(e, ticket, now() + interval '1 minute');
  begin
    insert into auth.users(id, email, raw_user_meta_data) values(gen_random_uuid(), test_email, jsonb_build_object('profile', person, 'enrollment_ticket', 'verification-ticket'));
    raise exception 'Duplicate enrollment created another account';
  exception when others then
    if sqlerrm not like '%already exists%' and sqlerrm not like '%duplicate key%' then raise; end if;
  end;
  if (select count(*) from auth.users where email = test_email) <> 1 then raise exception 'Duplicate Auth account exists'; end if;
end $$;
select 'PASS: cooldown, IP limit, expiry, grants, direct signup rejection, incomplete enrollment rollback, completed enrollment, duplicate rejection' as result;
