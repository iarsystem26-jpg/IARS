-- Allow RBAC roles to explicitly control the individual-member form.
-- Existing roster managers keep their current behavior; the administrator is
-- always granted this capability by the built-in role definition.
update public.rmc_roles
set data = data || jsonb_build_object(
  'permissions', coalesce(data->'permissions', '[]'::jsonb) || '["directory.add_members_manually"]'::jsonb
)
where data->>'id' in ('admin', 'ossa', 'ssg')
  and not (coalesce(data->'permissions', '[]'::jsonb) ? 'directory.add_members_manually');

