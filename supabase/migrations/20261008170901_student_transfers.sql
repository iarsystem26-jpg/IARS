-- Scoped transfer API. A batch is one transaction; no partial reassignment.
update public.rmc_roles set data = jsonb_set(data, '{permissions}',
  coalesce(data->'permissions', '[]'::jsonb) || '["directory.transfer_students"]'::jsonb)
where id in ('admin', 'ossa') and not (coalesce(data->'permissions', '[]'::jsonb) ? 'directory.transfer_students');

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
    'student_id', p.profile->>'student_id', 'node_id', coalesce(p.node_id,''), 'role', p.role_id)
    order by p.node_id, p.profile->>'name'), '[]'::jsonb) into result
  from public.rmc_profiles p
  where p.role_id in ('student','mayor') and p.status <> 'pending' and app_private.in_scope(p.node_id);
  return result;
end $$;

create or replace function app_private.transfer_students(changes jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a public.rmc_profiles := app_private.actor();
  p public.rmc_profiles; item jsonb; destination text; next_profile jsonb;
  ids text[]; names jsonb; college boolean; total integer := 0;
begin
  if auth.uid() is null or a.id is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  perform app_private.assert_permission('directory.transfer_students');
  if not exists(select 1 from public.rmc_roles r where r.id=a.role_id
    and not coalesce((r.data->>'isPositionOnly')::boolean,false) and r.data->'permissions' ? 'directory.transfer_students') then
    raise exception 'Permission required: directory.transfer_students' using errcode='42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' then raise exception 'Provide a transfer batch.'; end if;
  if jsonb_array_length(changes) not between 1 and 1000 then raise exception 'Transfer between 1 and 1,000 students per batch.'; end if;
  if exists(select 1 from jsonb_array_elements(changes) x group by x->>'uid' having count(*) > 1) then raise exception 'Duplicate student in transfer batch.'; end if;
  -- Lock affected paths in a consistent order against concurrent archival/editing.
  perform n.id from public.rmc_nodes n where n.id in (
    select unnest(app_private.path(x->>'destination_node_id')) from jsonb_array_elements(changes) x
  ) order by n.id for share;
  -- Lock students in UUID order to avoid deadlocks between overlapping batches.
  perform id from public.rmc_profiles where id in (
    select (x->>'uid')::uuid from jsonb_array_elements(changes) x
  ) order by id for update;
  for item in select value from jsonb_array_elements(changes) order by value->>'uid' loop
    select * into strict p from public.rmc_profiles where id=(item->>'uid')::uuid;
    if p.role_id not in ('student','mayor') or p.status='pending' then raise exception 'Choose an enrolled student.'; end if;
    perform app_private.assert_permission('directory.transfer_students', p.node_id);
    if p.node_id is distinct from nullif(item->>'source_node_id','')
      or lower(p.profile->>'student_id') is distinct from lower(item->>'student_id') then
      raise exception 'Student identity or assignment changed. Export a fresh template.';
    end if;
    destination := nullif(item->>'destination_node_id','');
    if destination is null then raise exception 'Choose a destination class.'; end if;
    perform app_private.assert_permission('directory.transfer_students', destination);
    ids := app_private.path(destination);
    -- Drop academic fields before rebuilding, avoiding stale track/program values.
    next_profile := jsonb_set(p.profile - 'official_data', '{school_data}',
      coalesce(p.profile->'school_data','{}') - array['type','department','track','strand','program','major','level','section','school_id','academic_assignment']);
    next_profile := app_private.assign_profile(next_profile, destination, false);
    select jsonb_object_agg(n.data->>'type', n.data->>'name'),
      bool_or(n.data->>'type' in ('college','program','year_level','block') or n.data#>>'{metadata,educationLevel}'='higher_ed')
      into names, college from public.rmc_nodes n where n.id=any(ids);
    next_profile := jsonb_set(next_profile, '{school_data}', next_profile->'school_data' || jsonb_strip_nulls(jsonb_build_object(
      'type', case when coalesce(college,false) then 'College' else 'High School' end,
      'track', names->>'track', 'strand', names->>'strand', 'program', names->>'program', 'major', names->>'major')));
    if destination = p.node_id then continue; end if;
    -- Mayor is a class designation: a transfer never carries it to a new class.
    update public.rmc_profiles set node_id=destination, role_id='student',
      profile=next_profile || '{"role":"student"}'::jsonb where id=p.id;
    insert into public.rmc_audit(actor_id, action, target, data) values(a.id, 'transferStudent', p.id::text,
      jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name',
        'source_node_id',p.node_id,'destination_node_id',destination,'previous_role',p.role_id));
    total := total + 1;
  end loop;
  return total;
end $$;

create or replace function public.rmc_transfer_roster() returns jsonb
language sql security invoker set search_path = '' as $$ select app_private.transfer_roster() $$;
create or replace function public.rmc_transfer_students(changes jsonb) returns integer
language sql security invoker set search_path = '' as $$ select app_private.transfer_students(changes) $$;
revoke all on function app_private.transfer_roster(), app_private.transfer_students(jsonb) from public, anon, authenticated;
revoke all on function public.rmc_transfer_roster(), public.rmc_transfer_students(jsonb) from public, anon;
grant execute on function app_private.transfer_roster(), app_private.transfer_students(jsonb) to authenticated;
grant execute on function public.rmc_transfer_roster(), public.rmc_transfer_students(jsonb) to authenticated;
