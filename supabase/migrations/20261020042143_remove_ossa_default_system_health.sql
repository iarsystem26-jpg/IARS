-- System Health is not granted to OSSA by default. Preserve every other grant
-- and all other role settings, including institution-specific customizations.
update public.rmc_roles
set data = jsonb_set(data, '{permissions}', (data->'permissions') - 'system.health')
where id = 'ossa'
  and jsonb_typeof(data->'permissions') = 'array'
  and (data->'permissions') ? 'system.health';
