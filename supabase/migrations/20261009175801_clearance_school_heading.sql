-- The highest academic ancestor is the school label; campus/school containers are a fallback.
create function app_private.clearance_school_name(assignment_node text) returns text language sql stable security invoker set search_path='' as $$
 with recursive ancestors as (
  select n.id,n.parent_id,n.data,0 as depth,array[n.id] as visited from public.rmc_nodes n where n.id=assignment_node
  union all select n.id,n.parent_id,n.data,a.depth+1,a.visited||n.id from public.rmc_nodes n join ancestors a on n.id=a.parent_id where not n.id=any(a.visited)
 ) select nullif(trim(data->>'name'),'') from ancestors
 order by case when data->>'type' in ('campus','school') then 1 else 0 end,depth desc limit 1
$$;
revoke all on function app_private.clearance_school_name(text) from public,anon,authenticated;
create or replace function app_private.clearance_command(operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  school:=app_private.clearance_school_name(a.node_id);
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

-- Correct the former campus label on issued snapshots without changing issue dates or references.
update app_private.clearance_certificates c set details=jsonb_set(c.details,'{school_name}',to_jsonb(app_private.clearance_school_name(p.node_id)))
from public.rmc_profiles p where p.id=c.student_id and app_private.clearance_school_name(p.node_id) is not null
and c.details->>'school_name'=(select n.data->>'name' from public.rmc_nodes n where n.id=any(app_private.path(p.node_id)) and n.parent_id is null);
