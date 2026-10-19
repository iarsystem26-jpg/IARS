-- Keep enrollment verification and applicant ownership queryable on the
-- application record. The enrollment key itself remains only as a bcrypt
-- hash on rmc_nodes.enrollment_key_hash.
alter table public.rmc_applications
  add column if not exists enrollment_node_id text references public.rmc_nodes(id) on delete restrict,
  add column if not exists enrollment_verified_at timestamptz;

create index if not exists rmc_applications_enrollment_node_idx
  on public.rmc_applications(enrollment_node_id);

create or replace function app_private.sync_application_enrollment_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  node_id text;
begin
  node_id := coalesce(
    new.data#>>'{form_data,school_data,academic_assignment,terminalGroupId}',
    new.data#>>'{form_data,official_data,assignment_node_id}'
  );
  new.enrollment_node_id := nullif(node_id, '');
  if new.enrollment_verified_at is null and new.enrollment_node_id is not null then
    new.enrollment_verified_at := now();
  end if;
  new.data := new.data
    || jsonb_build_object('enrollment_node_id', new.enrollment_node_id)
    || jsonb_build_object('enrollment_verified_at', extract(epoch from new.enrollment_verified_at) * 1000);
  return new;
end
$$;

drop trigger if exists rmc_application_enrollment_metadata on public.rmc_applications;
create trigger rmc_application_enrollment_metadata
before insert or update of data on public.rmc_applications
for each row execute function app_private.sync_application_enrollment_metadata();

update public.rmc_applications
set enrollment_node_id = coalesce(
      data#>>'{form_data,school_data,academic_assignment,terminalGroupId}',
      data#>>'{form_data,official_data,assignment_node_id}'
    ),
    enrollment_verified_at = coalesce(enrollment_verified_at, now())
where enrollment_node_id is null;

update public.rmc_applications
set data = data
  || jsonb_build_object('enrollment_node_id', enrollment_node_id)
  || jsonb_build_object('enrollment_verified_at', extract(epoch from enrollment_verified_at) * 1000)
where enrollment_node_id is not null
  and (not (data ? 'enrollment_node_id') or not (data ? 'enrollment_verified_at'));
