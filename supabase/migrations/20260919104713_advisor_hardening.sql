create function app_private.reserve_account(person jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;
begin
 p:=app_private.provision_check(person);
 insert into app_private.provision_reservations(email,actor_id) values(lower(person->>'email'),auth.uid()) on conflict(email) do update set actor_id=excluded.actor_id,created_at=now();
 return p;
end $$;
create or replace function public.rmc_reserve_account(person jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.reserve_account(person) $$;
revoke all on function app_private.reserve_account(jsonb) from public,anon;
grant execute on function app_private.reserve_account(jsonb) to authenticated;
-- Supabase's automatic RLS event trigger is not a public API.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
create policy internal_only on app_private.qr_tokens for all to anon,authenticated using (false) with check (false);
create policy internal_only on app_private.login_attempts for all to anon,authenticated using (false) with check (false);
create policy internal_only on app_private.provision_reservations for all to anon,authenticated using (false) with check (false);
create policy rmc_scanner_photo_read on storage.objects for select to authenticated using (bucket_id='rmc-documents' and (storage.foldername(name))[2]='photo' and app_private.permitted('attendance.scan') and app_private.can_read_profile(((storage.foldername(name))[1])::uuid));
