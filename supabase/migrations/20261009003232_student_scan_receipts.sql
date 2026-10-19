-- Only a verifier linked to the caller's own attendance is visible through this API.
create or replace function app_private.attendance_scanner(scanner_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('name', p.profile->>'name', 'role', p.role_id, 'photo_url', p.profile->>'photo_url')
 from public.rmc_profiles p
 where p.id = scanner_uid and (select auth.uid()) is not null
 and exists(select 1 from public.rmc_profiles actor where actor.id=(select auth.uid()) and actor.status='active')
 and exists(select 1 from public.rmc_attendance a where a.student_id=(select auth.uid())
   and a.data->>'scanned_by_uid'=scanner_uid::text)
$$;
revoke all on function app_private.attendance_scanner(uuid) from public, anon;
grant execute on function app_private.attendance_scanner(uuid) to authenticated;

create or replace function public.rmc_attendance_scanner(scanner_uid uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select app_private.attendance_scanner(scanner_uid)
$$;
revoke all on function public.rmc_attendance_scanner(uuid) from public, anon;
grant execute on function public.rmc_attendance_scanner(uuid) to authenticated;

-- Permit only the verifier's current profile photo, never their other documents.
create policy rmc_attendance_verifier_photo_read on storage.objects for select to authenticated
using (bucket_id='rmc-documents' and (storage.foldername(name))[2]='photo'
 and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then app_private.attendance_scanner(((storage.foldername(name))[1])::uuid)->>'photo_url' = 'storage://rmc-documents/'||name
 else false end);

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rmc_attendance') then
  alter publication supabase_realtime add table public.rmc_attendance;
 end if;
end $$;
