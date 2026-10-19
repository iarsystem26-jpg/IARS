-- Section enrollment keys are stored only as hashes. Clearing a key removes
-- both the hash and the public flag so that section enrollment is open again.
create or replace function app_private.sync_section_enrollment_key_flag()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.enrollment_key_hash is null then
    new.data := new.data - 'enrollmentKeyRequired';
  else
    new.data := new.data || '{"enrollmentKeyRequired":true}'::jsonb;
  end if;
  return new;
end $$;

drop trigger if exists rmc_sync_section_enrollment_key_flag on public.rmc_nodes;
create trigger rmc_sync_section_enrollment_key_flag
before insert or update of enrollment_key_hash on public.rmc_nodes
for each row execute function app_private.sync_section_enrollment_key_flag();

create or replace function app_private.clear_section_security_key(target text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_permission('directory.manage_members', target);
  update public.rmc_nodes
    set enrollment_key_hash = null,
        data = data - 'enrollmentKeyRequired'
    where id = target;
  if not found then raise exception 'Section not found.'; end if;
end $$;

create or replace function public.rmc_clear_section_security_key(target text)
returns void language sql security invoker set search_path='' as $$
  select app_private.clear_section_security_key(target)
$$;

revoke all on function app_private.clear_section_security_key(text) from public, anon, authenticated;
revoke all on function app_private.sync_section_enrollment_key_flag() from public, anon, authenticated;
revoke all on function public.rmc_clear_section_security_key(text) from public, anon;
grant execute on function public.rmc_clear_section_security_key(text) to authenticated;
