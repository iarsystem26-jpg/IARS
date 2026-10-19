-- Apply account status and enrolled MFA to personal reads as well as writes.
create function app_private.session_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_profiles p where p.id=(select auth.uid()) and p.status in ('active','pending')
 and ((select auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified')))
$$;
revoke all on function app_private.session_allowed() from public,anon;
grant execute on function app_private.session_allowed() to authenticated;
create or replace function app_private.can_read_profile(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ((select auth.uid())=target and app_private.session_allowed()) or exists(select 1 from public.rmc_profiles p where p.id=target
 and app_private.in_scope(p.node_id) and (app_private.permitted('directory.manage_members') or app_private.permitted('attendance.scan')
 or app_private.permitted('attendance.manage') or app_private.permitted('ossa.manage_cases')
 or app_private.permitted('system.manage_accounts') or app_private.permitted('system.manage_rbac')))
$$;
alter policy admission_read on public.rmc_applications using ((id=(select auth.uid()) and app_private.session_allowed()) or (app_private.permitted('directory.manage_members') and app_private.can_read_profile(id)));
alter policy sanction_read on public.rmc_sanctions using ((student_id=(select auth.uid()) and app_private.session_allowed()) or ((app_private.permitted('ossa.manage_cases') or app_private.permitted('attendance.manage')) and app_private.can_read_profile(student_id)));
alter policy excuse_read on public.rmc_excuses using ((student_id=(select auth.uid()) and app_private.session_allowed()) or (app_private.permitted('ossa.manage_cases') and app_private.can_read_profile(student_id)));
create policy rmc_document_session on storage.objects as restrictive for all to authenticated
 using (bucket_id<>'rmc-documents' or (select app_private.session_allowed()))
 with check (bucket_id<>'rmc-documents' or (select app_private.session_allowed()));
