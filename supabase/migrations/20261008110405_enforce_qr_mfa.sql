-- Preserve QR expiry, rotation, role, freeze, and locking behavior.
-- Enforce the same enrolled-MFA and account-status checks as private reads.
CREATE OR REPLACE FUNCTION app_private.issue_qr()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.rmc_profiles;
  token text := encode(extensions.gen_random_bytes(32),'hex');
  expires timestamptz := now()+interval '90 seconds';
begin
  if not app_private.session_allowed() then
    raise exception 'Verify your account and security code before requesting a QR pass.' using errcode='42501';
  end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.issue_print_qr(rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.rmc_profiles;
  token text;
  existing_token text;
begin
  if not app_private.session_allowed() then
    raise exception 'Verify your account and security code before requesting a QR pass.' using errcode='42501';
  end if;
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
end $function$
;

revoke all on function app_private.issue_qr(), app_private.issue_print_qr(boolean) from public, anon;
grant execute on function app_private.issue_qr(), app_private.issue_print_qr(boolean) to authenticated;
