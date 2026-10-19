-- Include only the profile photo alongside the existing scoped transfer identity.
create or replace function app_private.transfer_roster() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  perform app_private.assert_permission('directory.transfer_students');
  if not exists(select 1 from app_private.actor() a join public.rmc_roles r on r.id=a.role_id
    where not coalesce((r.data->>'isPositionOnly')::boolean,false) and r.data->'permissions' ? 'directory.transfer_students') then
    raise exception 'Permission required: directory.transfer_students' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('uid', p.id, 'name', p.profile->>'name',
    'photo_url', coalesce(p.profile->>'photo_url', ''),
    'student_id', p.profile->>'student_id', 'node_id', coalesce(p.node_id,''), 'role', p.role_id)
    order by p.node_id, p.profile->>'name'), '[]'::jsonb) into result
  from public.rmc_profiles p
  where p.role_id in ('student','mayor') and p.status <> 'pending' and app_private.in_scope(p.node_id);
  return result;
end $$;

