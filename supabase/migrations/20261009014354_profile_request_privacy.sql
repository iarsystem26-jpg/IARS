begin;
-- Remove deleted contact values from request history too, preserving the audit
-- metadata and field names without retaining the erased values.
create function app_private.redact_deleted_profile_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;
begin
 if new.kind='deletion' and new.status='approved' and old.status='pending' then
  for field in select jsonb_object_keys(new.changes) loop
   new.original:=jsonb_set(new.original,array[field],to_jsonb(''::text));
   update public.rmc_profile_requests set
    original=case when original ? field then jsonb_set(original,array[field],to_jsonb(''::text)) else original end,
    changes=case when changes ? field then jsonb_set(changes,array[field],to_jsonb(''::text)) else changes end
   where student_id=new.student_id and id<>new.id;
  end loop;
 end if;
 return new;
end $$;
create trigger redact_deleted_profile_request before update of status on public.rmc_profile_requests
 for each row execute function app_private.redact_deleted_profile_request();
revoke all on function app_private.redact_deleted_profile_request() from public,anon,authenticated;

-- OSSA staff may not have access to the hierarchy control panel.
create function app_private.profile_request_notice_path() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.source like 'profile-request:%:submitted' then
  if exists(select 1 from public.rmc_profiles where id=new.user_id and role_id in ('ossa','ossa_staff')) then
   new.path:='/ossa/dashboard';
  end if;
 end if;
 return new;
end $$;
create trigger profile_request_notice_path before insert on public.rmc_notifications
 for each row execute function app_private.profile_request_notice_path();
revoke all on function app_private.profile_request_notice_path() from public,anon,authenticated;
commit;
