begin;
-- Public legal documents remain readable during a freeze. This exception is
-- limited to GET/HEAD on this one table; edits and all workspace APIs stay blocked.
create or replace function app_private.enforce_freeze() returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  path text := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  method text := upper(coalesce(current_setting('request.method', true), ''));
begin
  if (select auth.jwt()->>'role') = 'authenticated' and app_private.access_frozen()
    and path <> 'rpc/rmc_snapshot'
    and not (path = 'rmc_legal_pages' and method in ('GET', 'HEAD')) then
    raise exception 'Access is frozen by school administration.' using errcode = '42501';
  end if;
end
$$;
revoke all on function app_private.enforce_freeze() from public;
grant execute on function app_private.enforce_freeze() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
