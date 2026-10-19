begin;
create table public.rmc_enrollment_confirmation (
 id smallint primary key default 1 check(id = 1),
 mode text not null default 'required' check(mode in ('required','bypass','google_only')),
 email_kind text not null default 'supabase' check(email_kind in ('supabase','custom')),
 instructions text not null default 'Open the confirmation email in your inbox. Check Spam or Junk if it is missing. Select Confirm your mail, then return here and check confirmation. If the link has expired, request a new email.' check(length(instructions) between 1 and 4000),
 image_url text not null default '' check(image_url = '' or (image_url ~ '^https://' and length(image_url) <= 2048)),
 email_subject text not null default 'Confirm your IARS enrollment email' check(length(email_subject) between 1 and 200),
 email_body text not null default 'Thank you for enrolling in IARS. Confirm your email address using the link below, then return to enrollment to continue your application.' check(length(email_body) between 1 and 8000)
);
insert into public.rmc_enrollment_confirmation(id) values (1);
alter table public.rmc_enrollment_confirmation enable row level security;
revoke all on public.rmc_enrollment_confirmation from public, anon, authenticated;
grant select on public.rmc_enrollment_confirmation to anon, authenticated;
grant all on public.rmc_enrollment_confirmation to service_role;
create policy enrollment_confirmation_read on public.rmc_enrollment_confirmation for select to anon, authenticated using(true);

-- Even an Auth configuration change cannot grant an unconfirmed new applicant
-- access to protected reads/writes. The marker is server-owned app metadata.
create or replace function app_private.session_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.rmc_profiles p where p.id = (select auth.uid()) and p.status in ('active','pending')
 and ((select auth.jwt()->>'aal') = 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
 and not exists(select 1 from auth.users u where u.id = p.id and u.raw_app_meta_data->>'enrollment_confirmation_required' = 'true' and u.email_confirmed_at is null))
$$;

create function app_private.set_enrollment_confirmation(confirmation text, settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); claims jsonb := (select auth.jwt()); result jsonb;
begin
 if actor is null or not exists(select 1 from public.rmc_profiles where id = actor and role_id = 'admin' and status = 'active')
 or not app_private.session_allowed() or app_private.access_frozen() then
  raise exception 'Only an active Super Admin can change enrollment confirmation.' using errcode = '42501';
 end if;
 if confirmation is distinct from 'initiate' then raise exception 'Type initiate exactly to confirm.'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f where f->>'method' = 'password'
 and (f->>'timestamp')::numeric between extract(epoch from now()) - 120 and extract(epoch from now()) + 10)
 or not exists(select 1 from auth.sessions where id::text = claims->>'session_id' and user_id = actor and (not_after is null or not_after > now())) then
 raise exception 'Verify your current password again.' using errcode = '42501'; end if;
 if exists(select 1 from auth.mfa_factors where user_id = actor and status = 'verified') and
 (claims->>'aal' is distinct from 'aal2' or not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f
 where f->>'method' in ('totp','mfa/totp','mfa/phone','phone') and (f->>'timestamp')::numeric
 between extract(epoch from now()) - 120 and extract(epoch from now()) + 10)) then
 raise exception 'Verify your current two-factor code again.' using errcode = '42501'; end if;
 if settings is not null then
  update public.rmc_enrollment_confirmation set mode = settings->>'mode', email_kind = settings->>'email_kind',
  instructions = settings->>'instructions', image_url = settings->>'image_url', email_subject = settings->>'email_subject', email_body = settings->>'email_body' where id = 1;
  insert into public.rmc_audit(actor_id,action,target,data) values(actor,'enrollment.confirmation_updated','enrollment',settings);
 end if;
 select to_jsonb(s) - 'id' into result from public.rmc_enrollment_confirmation s where id = 1;
 return result;
end $$;
revoke all on function app_private.set_enrollment_confirmation(text,jsonb) from public, anon, authenticated;
grant execute on function app_private.set_enrollment_confirmation(text,jsonb) to authenticated;
create function public.rmc_set_enrollment_confirmation(confirmation text, settings jsonb default null) returns jsonb
language sql security invoker set search_path = '' as $$ select app_private.set_enrollment_confirmation(confirmation,settings); $$;
revoke all on function public.rmc_set_enrollment_confirmation(text,jsonb) from public, anon;
grant execute on function public.rmc_set_enrollment_confirmation(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
