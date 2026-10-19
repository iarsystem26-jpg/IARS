-- Add privacy-preserving enrollee details to the public status response.
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
    'clarificationFields', coalesce(a.data->'clarification_fields', '[]'::jsonb),
    'namePreview', left(trim(a.data#>>'{form_data,name}'), 1) || '•••',
    'emailPreview', case when position('@' in (a.data#>>'{form_data,email}')) > 1 then left(a.data#>>'{form_data,email}', 1) || '•••' || substring(a.data#>>'{form_data,email}' from position('@' in (a.data#>>'{form_data,email}'))) else '•••' end,
    'sectionPreview', coalesce(nullif(a.data#>>'{form_data,school_data,section}', ''), nullif(a.data#>>'{form_data,school_data,academic_assignment,terminalGroupId}', ''), 'Unassigned')
  ) into result
  from public.rmc_applications a
  where trim(a.data#>>'{form_data,student_id}') = trim(lookup_student_id)
  order by (a.data->>'submission_date')::numeric desc nulls last
  limit 1;
  if result is not null then return result; end if;
  select jsonb_build_object('found', true, 'status', 'approved', 'namePreview', left(trim(p.profile->>'name'), 1) || '•••', 'emailPreview', '•••', 'sectionPreview', 'Enrolled') into result
  from public.rmc_profiles p
  where trim(p.profile->>'student_id') = trim(lookup_student_id) and p.status = 'active' limit 1;
  return coalesce(result, jsonb_build_object('found', false));
end
$$;
grant execute on function public.rmc_lookup_enrollment(text) to anon, authenticated;
