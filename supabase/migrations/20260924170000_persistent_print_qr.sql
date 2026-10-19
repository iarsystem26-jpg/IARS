-- Keep the live QR short-lived while allowing a printed card to keep one
-- stable token until the owner explicitly replaces it.
alter table app_private.qr_tokens alter column expires_at drop not null;
alter table app_private.qr_tokens add column if not exists token_value text;

create unique index if not exists qr_tokens_print_student_idx
  on app_private.qr_tokens(student_id)
  where expires_at is null;

create or replace function app_private.issue_qr() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.rmc_profiles;
  token text := encode(extensions.gen_random_bytes(32),'hex');
  expires timestamptz := now()+interval '90 seconds';
begin
  select * into strict a
    from public.rmc_profiles
   where id=(select auth.uid()) and status='active'
   for update;
  if a.role_id not in ('student','mayor','ssg') then raise exception 'An active student account is required.'; end if;
  if app_private.frozen(a.node_id) then raise exception 'Attendance is frozen for your unit.'; end if;
  delete from app_private.qr_tokens where student_id=a.id and expires_at is not null and expires_at<now();
  insert into app_private.qr_tokens(token_hash,student_id,expires_at,token_value)
    values(encode(extensions.digest(token,'sha256'),'hex'),a.id,expires,null);
  return jsonb_build_object('token','RMC1:'||token,'expiresAt',extract(epoch from expires)*1000,'persistent',false);
end $$;

create or replace function app_private.issue_print_qr(rotate boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.rmc_profiles;
  token text;
  existing_token text;
begin
  select * into strict a
    from public.rmc_profiles
   where id=(select auth.uid()) and status='active'
   for update;
  if a.role_id not in ('student','mayor','ssg') then raise exception 'An active student account is required.'; end if;
  if app_private.frozen(a.node_id) then raise exception 'Attendance is frozen for your unit.'; end if;

  if not rotate then
    select token_value into existing_token
      from app_private.qr_tokens
     where student_id=a.id and expires_at is null and token_value is not null
     limit 1;
    if existing_token is not null then
      return jsonb_build_object('token',existing_token,'expiresAt',null,'persistent',true);
    end if;
  end if;

  delete from app_private.qr_tokens where student_id=a.id and expires_at is null;
  token := 'RMC1:'||encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.qr_tokens(token_hash,student_id,expires_at,token_value)
    values(encode(extensions.digest(substring(token from 6),'sha256'),'hex'),a.id,null,token);
  if rotate then
    insert into public.rmc_audit(actor_id,action,target,data)
      values(a.id,'qr.print_refreshed',a.id::text,jsonb_build_object('target_name',a.profile->>'name'));
  end if;
  return jsonb_build_object('token',token,'expiresAt',null,'persistent',true);
end $$;

create or replace function app_private.resolve_qr(token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles;
begin
  perform app_private.assert_permission('attendance.scan');
  if token !~ '^RMC1:[0-9a-f]{64}$' then raise exception 'Invalid QR code. Ask the student to open their current QR.'; end if;
  select p1.* into p
    from app_private.qr_tokens q
    join public.rmc_profiles p1 on p1.id=q.student_id
   where q.token_hash=encode(extensions.digest(substring(token from 6),'sha256'),'hex')
     and (q.expires_at is null or q.expires_at>now())
     and p1.status='active';
  if p.id is null then raise exception 'QR code expired or was replaced. Ask the student to use the current QR.'; end if;
  perform app_private.assert_permission('attendance.scan',p.node_id);
  return p.profile;
end $$;

create or replace function public.rmc_get_print_qr() returns jsonb
language sql security invoker set search_path='' as $$ select app_private.issue_print_qr(false) $$;

create or replace function public.rmc_refresh_print_qr() returns jsonb
language sql security invoker set search_path='' as $$ select app_private.issue_print_qr(true) $$;

grant execute on function app_private.issue_print_qr(boolean) to authenticated;
grant execute on function public.rmc_get_print_qr(),public.rmc_refresh_print_qr() to authenticated;
revoke all on function public.rmc_get_print_qr(),public.rmc_refresh_print_qr() from public,anon;
