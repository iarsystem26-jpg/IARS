-- Bridge the explicit student-management permissions into the command gateway.
-- The gateway's existing command branches continue to use the legacy permission
-- names; this mapping lets administrators grant only the corresponding new RBAC
-- capability to custom roles while keeping mayor accounts excluded.
create or replace function app_private.permitted(permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
   select 1 from app_private.actor() p
   join public.rmc_roles r on r.id=p.role_id
   where not coalesce((r.data->>'isPositionOnly')::boolean,false)
     and (p.role_id='admin'
       or r.data->'permissions' ? permission
       or (permission='directory.manage_members' and r.data->'permissions' ? 'directory.change_member_designation')
       or (permission='ossa.manage_cases' and r.data->'permissions' ? 'directory.manage_student_sanctions'))
 ),false)
$$;
