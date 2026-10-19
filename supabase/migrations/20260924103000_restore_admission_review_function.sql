-- Repair migration: restore reviewer decisions when the workflow migration was
-- recorded in history before its functions were created remotely.
create or replace function app_private.review_admission(
  application_id uuid,
  decision text,
  reason text default null,
  clarification_fields text[] default '{}'::text[]
) returns void
language plpgsql security definer set search_path = ''
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
    if exists (select 1 from unnest(clarification_fields) field_name where not (field_name = any(allowed_fields))) then raise exception 'Invalid clarification field.'; end if;
  end if;
  update public.rmc_applications set data = data || jsonb_build_object(
    'status', decision, 'rejection_reason', trim(reason),
    'clarification_fields', case when decision = 'bounced' then to_jsonb(clarification_fields) else '[]'::jsonb end,
    'reviewed_at', reviewed_at, 'reviewed_by', actor.id,
    'rejection_count', coalesce((data->>'rejection_count')::integer, 0) + case when decision = 'rejected' then 1 else 0 end
  ) where id = application_id;
  insert into public.rmc_audit(actor_id, action, target, data)
  values (actor.id, 'admission.' || decision, application_id::text,
    jsonb_build_object('actor_name', actor.profile->>'name', 'target_name', applicant.profile->>'name', 'reason', trim(reason)));
end
$$;
create or replace function public.rmc_review_admission(application_id uuid, decision text, reason text default null, clarification_fields text[] default '{}'::text[])
returns void language sql security invoker set search_path = ''
as $$ select app_private.review_admission(application_id, decision, reason, clarification_fields) $$;
revoke all on function app_private.review_admission(uuid,text,text,text[]) from public, anon, authenticated;
revoke all on function public.rmc_review_admission(uuid,text,text,text[]) from public, anon;
grant execute on function public.rmc_review_admission(uuid,text,text,text[]) to authenticated;
