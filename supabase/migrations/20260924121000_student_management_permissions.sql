-- Add explicit student-management permissions to built-in role records.
-- The command function enforces these permissions for designation and sanction changes.
update public.rmc_roles
set data = jsonb_set(data, '{permissions}', coalesce(data->'permissions', '[]'::jsonb) || '["directory.change_member_designation","directory.manage_student_sanctions"]'::jsonb)
where id in ('admin','ossa')
  and not (coalesce(data->'permissions', '[]'::jsonb) ? 'directory.change_member_designation');
update public.rmc_roles
set data = jsonb_set(data, '{permissions}', coalesce(data->'permissions', '[]'::jsonb) || '["directory.manage_student_sanctions"]'::jsonb)
where id = 'ossa_staff'
  and not (coalesce(data->'permissions', '[]'::jsonb) ? 'directory.manage_student_sanctions');
