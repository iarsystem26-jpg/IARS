-- Section mayors are permitted to review admissions in their assigned scope.
update public.rmc_roles
set data = data || jsonb_build_object(
  'permissions',
  case
    when (data->'permissions') ? 'directory.manage_members' then data->'permissions'
    else (data->'permissions') || '["directory.manage_members"]'::jsonb
  end
)
where id = 'mayor';
