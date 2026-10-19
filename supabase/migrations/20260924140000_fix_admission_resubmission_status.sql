-- Ensure the live admission update function accepts all statuses that the
-- application UI exposes as resubmittable.
create or replace function app_private.admission_update(
  documents jsonb,
  person jsonb default null,
  enrollment_key text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.rmc_profiles;
  d jsonb;
  key text;
  value text;
  n text;
  secret text;
begin
  select * into strict p
  from public.rmc_profiles
  where id = auth.uid()
  for update;

  if p.status <> 'pending' then
    raise exception 'Only pending admissions can be updated.';
  end if;

  select data into strict d
  from public.rmc_applications
  where id = p.id
  for update;

  if person is not null then
    if d->>'status' not in ('rejected', 'bounced', 'deleted') then
      raise exception 'This application cannot be resubmitted.';
    end if;

    n := person#>>'{school_data,academic_assignment,terminalGroupId}';
    if app_private.frozen(n) then
      raise exception 'Enrollment is frozen.';
    end if;

    select enrollment_key_hash into secret
    from public.rmc_nodes
    where id = n;
    if secret is not null
      and extensions.crypt(upper(trim(coalesce(enrollment_key, ''))), secret) <> secret then
      raise exception 'Invalid enrollment key.';
    end if;

    p.profile := app_private.assign_profile(
      p.profile || jsonb_build_object(
        'name', trim(person->>'name'),
        'student_id', trim(person->>'student_id'),
        'guardian', person->'guardian'
      ),
      n
    );
    update public.rmc_profiles
    set profile = p.profile, node_id = n
    where id = p.id;

    d := (d - 'rejection_reason' - 'clarification_fields' - 'reviewed_at' - 'reviewed_by')
      || jsonb_build_object(
        'status', 'pending',
        'form_data', p.profile,
        'submission_date', extract(epoch from now()) * 1000
      );
  end if;

  for key, value in select * from jsonb_each_text(coalesce(documents, '{}'::jsonb)) loop
    if key not in ('photo', 'id_front', 'id_back')
      or value not like 'storage://' || p.id::text || '/%' then
      raise exception 'Invalid document.';
    end if;
    if key = 'photo' and lower(value) !~ '\.(jpeg|jpg|png|webp)$' then
      raise exception 'Choose an image for the profile photo.';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'rmc-documents'
        and name = substring(value from 11)
    ) then
      raise exception 'Upload the document first.';
    end if;
  end loop;

  update public.rmc_applications
  set data = d || jsonb_build_object(
    'documents', coalesce(d->'documents', '{}'::jsonb) || coalesce(documents, '{}'::jsonb)
  )
  where id = p.id;
end
$$;

grant execute on function public.rmc_admission_update(jsonb, jsonb, text) to authenticated;
