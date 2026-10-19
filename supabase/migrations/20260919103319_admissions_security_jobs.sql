create table app_private.login_attempts (key text primary key, attempts integer not null default 1, window_start timestamptz not null default now());
alter table app_private.login_attempts enable row level security;
create function public.rmc_login_limit(identifier_hash text,ip_hash text) returns void language plpgsql security definer set search_path='' as $$
declare k text; total integer;
begin
 foreach k in array array['user:'||identifier_hash,'ip:'||ip_hash] loop
  insert into app_private.login_attempts(key) values(k) on conflict(key) do update set attempts=case when login_attempts.window_start<now()-interval '15 minutes' then 1 else login_attempts.attempts+1 end,window_start=case when login_attempts.window_start<now()-interval '15 minutes' then now() else login_attempts.window_start end returning attempts into total;
  if total>(case when left(k,3)='ip:' then 100 else 20 end) then raise exception 'Rate limit reached.'; end if;
 end loop;
 delete from app_private.login_attempts where window_start<now()-interval '1 day';
end $$;
revoke all on function public.rmc_login_limit(text,text) from public,anon,authenticated;
grant execute on function public.rmc_login_limit(text,text) to service_role;

create function app_private.admission_update(documents jsonb, person jsonb default null, enrollment_key text default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles; d jsonb; key text; value text; n text; secret text;
begin
 select * into strict p from public.rmc_profiles where id=auth.uid() for update;
 if p.status<>'pending' then raise exception 'Only pending admissions can be updated.'; end if;
 select data into strict d from public.rmc_applications where id=p.id for update;
 if person is not null then
  if d->>'status'<>'rejected' or (d->>'rejection_count')::int>=3 then raise exception 'This application cannot be resubmitted.'; end if;
  n:=person#>>'{school_data,academic_assignment,terminalGroupId}';
  if app_private.frozen(n) then raise exception 'Enrollment is frozen.'; end if;
  select enrollment_key_hash into secret from public.rmc_nodes where id=n;
  if secret is not null and extensions.crypt(upper(trim(coalesce(enrollment_key,''))),secret)<>secret then raise exception 'Invalid enrollment key.'; end if;
  p.profile:=app_private.assign_profile(p.profile||jsonb_build_object('name',trim(person->>'name'),'student_id',trim(person->>'student_id'),'guardian',person->'guardian'),n);
  update public.rmc_profiles set profile=p.profile,node_id=n where id=p.id;
  d:=d||jsonb_build_object('status','pending','form_data',p.profile,'submission_date',extract(epoch from now())*1000);
 end if;
 for key,value in select * from jsonb_each_text(documents) loop
  if key not in ('photo','id_front','id_back') or value not like 'storage://' || p.id::text || '/%' then raise exception 'Invalid document.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='rmc-documents' and name=substring(value from 11)) then raise exception 'Upload the document first.'; end if;
 end loop;
 update public.rmc_applications set data=d||jsonb_build_object('documents',coalesce(d->'documents','{}')||documents) where id=p.id;
end $$;
create function public.rmc_admission_update(documents jsonb,person jsonb default null,enrollment_key text default null) returns void language sql security invoker set search_path='' as $$select app_private.admission_update(documents,person,enrollment_key)$$;
revoke all on function app_private.admission_update(jsonb,jsonb,text),public.rmc_admission_update(jsonb,jsonb,text) from public,anon;
grant execute on function app_private.admission_update(jsonb,jsonb,text),public.rmc_admission_update(jsonb,jsonb,text) to authenticated;

-- A verified second factor is required for protected operations once enrolled.
create or replace function app_private.actor() returns public.rmc_profiles language sql stable security definer set search_path='' as $$
 select p from public.rmc_profiles p where p.id=(select auth.uid()) and p.status='active'
 and ((select auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified'))
$$;
create or replace function app_private.permitted(permission text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from app_private.actor() p join public.rmc_roles r on r.id=p.role_id
 where not coalesce((r.data->>'isPositionOnly')::boolean,false) and (p.role_id='admin' or r.data->'permissions' ? permission)),false)
$$;
-- Keep the core account columns and JSON representations consistent at rest.
alter table public.rmc_profiles add constraint rmc_profile_identity_check check (profile->>'uid'=id::text and profile->>'role'=role_id and profile->>'account_status'=status and profile->>'name' is not null and profile->>'username' is not null and profile->>'student_id' is not null and profile->>'email' is not null);
create unique index rmc_one_active_mayor_idx on public.rmc_profiles(node_id) where role_id='mayor' and status='active';

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rmc-finalize-attendance','* * * * *','select app_private.finalize_events()');
