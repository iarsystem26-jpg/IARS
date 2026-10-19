-- Private records: clients use narrow, server-authorized RPCs only.
create table app_private.clearance_schedules (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 3 and 120),
 node_id text not null references public.rmc_nodes(id), starts_at timestamptz not null, ends_at timestamptz not null,
 release_enabled boolean not null default false, released_by text, created_by uuid not null references public.rmc_profiles(id),
 created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create index clearance_schedules_scope_idx on app_private.clearance_schedules(node_id, ends_at);
create table app_private.clearance_qualifications (
 schedule_id uuid references app_private.clearance_schedules(id), student_id uuid references public.rmc_profiles(id),
 cleared_at timestamptz not null, primary key(schedule_id,student_id)
);
create index clearance_qualifications_student_idx on app_private.clearance_qualifications(student_id);
create table app_private.clearance_certificates (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references app_private.clearance_schedules(id),
 student_id uuid not null references public.rmc_profiles(id), cleared_at timestamptz not null,
 issued_at timestamptz not null default now(), revoked_at timestamptz,
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 reference text not null unique default ('CLR-'||upper(replace(gen_random_uuid()::text,'-',''))),
 details jsonb not null, unique(schedule_id,student_id,cleared_at)
);
create index clearance_certificates_student_idx on app_private.clearance_certificates(student_id);
alter table app_private.clearance_schedules enable row level security;
alter table app_private.clearance_qualifications enable row level security;
alter table app_private.clearance_certificates enable row level security;
revoke all on app_private.clearance_schedules, app_private.clearance_qualifications, app_private.clearance_certificates from public, anon, authenticated;

-- Capture the actual server ledger transition, never a browser-supplied clearance date.
create function app_private.track_clearance() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles; balance numeric; change numeric; stamp timestamptz:=clock_timestamp();
begin
 select * into strict p from public.rmc_profiles where id=new.student_id for update;
 balance:=app_private.balance(p.id); change:=(new.data->>'change')::numeric;
 if balance>0 then
  delete from app_private.clearance_qualifications where student_id=p.id;
  update app_private.clearance_certificates set revoked_at=stamp where student_id=p.id and revoked_at is null;
 elsif change<0 and balance-change>0 and p.role_id in ('student','mayor','ssg') then
  insert into app_private.clearance_qualifications(schedule_id,student_id,cleared_at)
  select s.id,p.id,stamp from app_private.clearance_schedules s
  where stamp>=s.starts_at and stamp<=s.ends_at and s.node_id=any(app_private.path(p.node_id))
  on conflict(schedule_id,student_id) do update set cleared_at=excluded.cleared_at;
 end if;
 return new;
end $$;
revoke all on function app_private.track_clearance() from public,anon,authenticated;
create trigger rmc_track_clearance after insert on public.rmc_sanctions for each row execute function app_private.track_clearance();

create function app_private.clearance_command(operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); s app_private.clearance_schedules; c app_private.clearance_certificates;
 q app_private.clearance_qualifications; result jsonb; school text;
begin
 if a.id is null then raise exception 'An active account is required.' using errcode='42501'; end if;
 if app_private.frozen(a.node_id) then raise exception 'Clearance operations are frozen.'; end if;
 if operation in ('manage','create','release') then
  if a.role_id not in ('ossa','ossa_staff') or a.node_id is null then raise exception 'An assigned OSSA reviewer is required.' using errcode='42501'; end if;
  perform app_private.assert_permission('ossa.manage_cases',a.node_id);
  if operation='create' then
   if coalesce(length(trim(payload->>'title')),0) not between 3 and 120
    or (payload->>'starts_at')::timestamptz is null or (payload->>'ends_at')::timestamptz is null
    or (payload->>'starts_at')::timestamptz<date_trunc('minute',statement_timestamp())
    or (payload->>'ends_at')::timestamptz<=(payload->>'starts_at')::timestamptz then
    raise exception 'Enter a title and a current or future clearing period, with an end after its start.';
   end if;
   insert into app_private.clearance_schedules(title,node_id,starts_at,ends_at,created_by)
   values(trim(payload->>'title'),a.node_id,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,a.id) returning * into s;
   insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'clearance.schedule_created',s.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',s.title));
  elsif operation='release' then
   select * into strict s from app_private.clearance_schedules where id=(payload->>'schedule_id')::uuid for update;
   perform app_private.assert_permission('ossa.manage_cases',s.node_id);
   if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Choose a release state.'; end if;
   update app_private.clearance_schedules set release_enabled=(payload->>'enabled')::boolean,
    released_by=case when (payload->>'enabled')::boolean then a.profile->>'name' else released_by end where id=s.id;
   insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'clearance.release_changed',s.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',s.title,'enabled',payload->'enabled'));
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc),'[]') into result from (
   select sch.*, (select count(*) from app_private.clearance_qualifications qual where qual.schedule_id=sch.id) as eligible_count,
    (select count(*) from app_private.clearance_certificates cert where cert.schedule_id=sch.id and cert.revoked_at is null) as issued_count
   from app_private.clearance_schedules sch where app_private.in_scope(sch.node_id)
  ) x;
  return result;
 end if;
 if a.role_id not in ('student','mayor','ssg') then raise exception 'A student account is required.' using errcode='42501'; end if;
 if operation='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',sch.id,'title',sch.title,'starts_at',sch.starts_at,'ends_at',sch.ends_at,
   'release_enabled',sch.release_enabled,'cleared_at',qual.cleared_at,
   'eligible',qual.student_id is not null and app_private.balance(a.id)=0,
   'certificate',case when cert.id is not null and cert.revoked_at is null then to_jsonb(cert)-'student_id'-'schedule_id' else null end) order by sch.starts_at desc),'[]') into result
  from app_private.clearance_schedules sch
  left join app_private.clearance_qualifications qual on qual.schedule_id=sch.id and qual.student_id=a.id
  left join app_private.clearance_certificates cert on cert.schedule_id=sch.id and cert.student_id=a.id and cert.cleared_at=qual.cleared_at
  where sch.node_id=any(app_private.path(a.node_id));
  return result;
 elsif operation='issue' then
  -- Same student lock used by sanction writes; release changes serialize on the schedule.
  perform 1 from public.rmc_profiles where id=a.id for update;
  select * into strict s from app_private.clearance_schedules where id=(payload->>'schedule_id')::uuid for share;
  if not s.node_id=any(app_private.path(a.node_id)) or not s.release_enabled then raise exception 'OSSA has not released this certificate.'; end if;
  select * into q from app_private.clearance_qualifications where schedule_id=s.id and student_id=a.id;
  if q.student_id is null or app_private.balance(a.id)<>0 then raise exception 'Clear all sanctions during the scheduled clearing period to qualify.'; end if;
  select n.data->>'name' into school from public.rmc_nodes n where n.id=any(app_private.path(a.node_id)) and n.parent_id is null;
  insert into app_private.clearance_certificates(schedule_id,student_id,cleared_at,details)
   values(s.id,a.id,q.cleared_at,jsonb_build_object('student_name',a.profile->>'name','student_number',a.profile->>'student_id',
   'school_name',coalesce(school,'RMC'),'period_title',s.title,'starts_at',s.starts_at,'ends_at',s.ends_at,'authorized_by',s.released_by))
   on conflict(schedule_id,student_id,cleared_at) do nothing returning * into c;
  if c.id is null then select * into strict c from app_private.clearance_certificates where schedule_id=s.id and student_id=a.id and cleared_at=q.cleared_at; end if;
  if c.revoked_at is not null then raise exception 'This certificate has been revoked.'; end if;
  insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'clearance.download_requested',c.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',c.reference));
  return to_jsonb(c)-'student_id'-'schedule_id';
 end if;
 raise exception 'Unknown clearance operation.';
end $$;
revoke all on function app_private.clearance_command(text,jsonb) from public,anon;
grant execute on function app_private.clearance_command(text,jsonb) to authenticated;
create function public.rmc_clearance(operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select app_private.clearance_command(operation,payload)
$$;
revoke all on function public.rmc_clearance(text,jsonb) from public,anon;
grant execute on function public.rmc_clearance(text,jsonb) to authenticated;

-- The random bearer token is the only public lookup. No student-ID or reference search.
create function app_private.verify_clearance(verification_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c app_private.clearance_certificates;
begin
 if verification_token is null or verification_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('found',false); end if;
 select * into c from app_private.clearance_certificates where token=verification_token;
 if c.id is null then return jsonb_build_object('found',false); end if;
 return jsonb_build_object('found',true,'valid',c.revoked_at is null and app_private.balance(c.student_id)=0
  and exists(select 1 from public.rmc_profiles p where p.id=c.student_id and p.status='active'),
  'reference',c.reference,'student_name',c.details->>'student_name','school_name',c.details->>'school_name',
  'period_title',c.details->>'period_title','issued_at',c.issued_at,'cleared_at',c.cleared_at);
end $$;
revoke all on function app_private.verify_clearance(text) from public;
grant usage on schema app_private to anon;
grant execute on function app_private.verify_clearance(text) to anon,authenticated;
create function public.rmc_verify_clearance(verification_token text) returns jsonb language sql stable security invoker set search_path='' as $$
 select app_private.verify_clearance(verification_token)
$$;
revoke all on function public.rmc_verify_clearance(text) from public;
grant execute on function public.rmc_verify_clearance(text) to anon,authenticated;
