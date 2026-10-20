-- Linked deletion records are available only through a freshly password/MFA
-- authenticated session, before any review or transfer selection is shown.
create function app_private.assert_unit_review_verification() returns void
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); actor uuid:=auth.uid();
begin
 if actor is null or not app_private.session_allowed() or app_private.access_frozen() then
  raise exception 'Sign in with an active account.' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f where f->>'method'='password'
  and (f->>'timestamp')::numeric between extract(epoch from now())-120 and extract(epoch from now())+10)
 or not exists(select 1 from auth.sessions where id::text=claims->>'session_id' and user_id=actor and (not_after is null or not_after>now())) then
  raise exception 'Verify your current password before reviewing deletion records.' using errcode='42501'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=actor and status='verified') and
  (claims->>'aal' is distinct from 'aal2' or not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f
   where f->>'method' in ('totp','mfa/totp','mfa/phone','phone') and (f->>'timestamp')::numeric
   between extract(epoch from now())-120 and extract(epoch from now())+10)) then
  raise exception 'Verify your current authenticator code before reviewing deletion records.' using errcode='42501'; end if;
end $$;

create or replace function public.rmc_preview_unit_deletion(target text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.assert_unit_review_verification();
 return app_private.unit_deletion_inventory(target);
end $$;
revoke all on function app_private.assert_unit_review_verification() from public,anon,authenticated;
revoke all on function public.rmc_preview_unit_deletion(text) from public,anon;
grant execute on function public.rmc_preview_unit_deletion(text) to authenticated;
