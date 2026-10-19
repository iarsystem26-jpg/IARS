-- Admission reviewers can approve, reject, return, or remove an application.
-- Returned applications carry an explicit list of fields that the enrollee must
-- clarify. Rejected and removed applications can also be submitted again.

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
  select * into strict p from public.rmc_profiles where id = auth.uid() for update;
  if p.status <> 'pending' then raise exception 'Only pending admissions can be updated.'; end if;
  select data into strict d from public.rmc_applications where id = p.id for update;

  if person is not null then
    if d->>'status' not in ('rejected', 'bounced', 'deleted') then
      raise exception 'This application cannot be resubmitted.';
    end if;
    n := person#>>'{school_data,academic_assignment,terminalGroupId}';
    if app_private.frozen(n) then raise exception 'Enrollment is frozen.'; end if;
    select enrollment_key_hash into secret from public.rmc_nodes where id = n;
    if secret is not null and extensions.crypt(upper(trim(coalesce(enrollment_key, ''))), secret) <> secret then
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
    update public.rmc_profiles set profile = p.profile, node_id = n where id = p.id;
    d := (d - 'rejection_reason' - 'clarification_fields' - 'reviewed_at' - 'reviewed_by')
      || jsonb_build_object(
        'status', 'pending',
        'form_data', p.profile,
        'submission_date', extract(epoch from now()) * 1000
      );
  end if;

  for key, value in select * from jsonb_each_text(coalesce(documents, '{}'::jsonb)) loop
    if key not in ('photo', 'id_front', 'id_back') or value not like 'storage://' || p.id::text || '/%' then
      raise exception 'Invalid document.';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'rmc-documents' and name = substring(value from 11)
    ) then raise exception 'Upload the document first.'; end if;
  end loop;

  update public.rmc_applications
  set data = d || jsonb_build_object('documents', coalesce(d->'documents', '{}'::jsonb) || coalesce(documents, '{}'::jsonb))
  where id = p.id;
end
$$;

create or replace function app_private.review_admission(
  application_id uuid,
  decision text,
  reason text default null,
  clarification_fields text[] default '{}'::text[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.rmc_profiles := app_private.actor();
  applicant public.rmc_profiles;
  application jsonb;
  allowed_fields constant text[] := array['name', 'student_id', 'guardian_name', 'guardian_phone', 'academic_assignment', 'photo', 'id_front', 'id_back'];
  reviewed_at numeric := extract(epoch from now()) * 1000;
begin
  if actor.id is null then raise exception 'You are not authorized to review admissions.'; end if;
  select * into strict applicant from public.rmc_profiles where id = application_id for update;
  perform app_private.assert_permission('directory.manage_members', applicant.node_id);
  select data into strict application from public.rmc_applications where id = application_id for update;
  if application->>'status' <> 'pending' then raise exception 'This application has already been reviewed.'; end if;
  if decision not in ('rejected', 'bounced', 'deleted') then raise exception 'Invalid admission decision.'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then raise exception 'Provide a reason for this decision.'; end if;
  if decision = 'bounced' then
    if coalesce(array_length(clarification_fields, 1), 0) = 0 then raise exception 'Choose at least one field that needs clarification.'; end if;
    if exists (select 1 from unnest(clarification_fields) field_name where not (field_name = any(allowed_fields))) then
      raise exception 'Invalid clarification field.';
    end if;
  end if;

  update public.rmc_applications
  set data = data || jsonb_build_object(
    'status', decision,
    'rejection_reason', trim(reason),
    'clarification_fields', case when decision = 'bounced' then to_jsonb(clarification_fields) else '[]'::jsonb end,
    'reviewed_at', reviewed_at,
    'reviewed_by', actor.id,
    'rejection_count', coalesce((data->>'rejection_count')::integer, 0) + case when decision = 'rejected' then 1 else 0 end
  )
  where id = application_id;

  insert into public.rmc_audit(actor_id, action, target, data)
  values (
    actor.id,
    'admission.' || decision,
    application_id::text,
    jsonb_build_object('actor_name', actor.profile->>'name', 'target_name', applicant.profile->>'name', 'reason', trim(reason))
  );
end
$$;

create or replace function public.rmc_review_admission(
  application_id uuid,
  decision text,
  reason text default null,
  clarification_fields text[] default '{}'::text[]
) returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.review_admission(application_id, decision, reason, clarification_fields)
$$;

create or replace function app_private.lookup_enrollment(lookup_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if lookup_student_id is null or trim(lookup_student_id) !~ '^[0-9]{4}-[0-9]{5}$' then
    return jsonb_build_object('found', false);
  end if;
  select jsonb_build_object(
    'found', true,
    'status', a.data->>'status',
    'submittedAt', (a.data->>'submission_date')::numeric,
    'reviewedAt', (a.data->>'reviewed_at')::numeric,
    'rejectionReason', nullif(a.data->>'rejection_reason', ''),
    'clarificationFields', coalesce(a.data->'clarification_fields', '[]'::jsonb)
  ) into result
  from public.rmc_applications a
  where trim(a.data#>>'{form_data,student_id}') = trim(lookup_student_id)
  order by a.created_at desc limit 1;
  if result is not null then return result; end if;
  select jsonb_build_object('found', true, 'status', 'approved') into result
  from public.rmc_profiles p
  where trim(p.profile->>'student_id') = trim(lookup_student_id) and p.status = 'active'
  limit 1;
  return coalesce(result, jsonb_build_object('found', false));
end
$$;

revoke all on function app_private.review_admission(uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function public.rmc_review_admission(uuid, text, text, text[]) from public, anon;
grant execute on function public.rmc_review_admission(uuid, text, text, text[]) to authenticated;

