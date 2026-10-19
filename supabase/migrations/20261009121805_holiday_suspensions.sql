-- Academic closures suspend participation without cancelling unrelated recipients.
create table public.rmc_calendar_closures (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 3 and 120),
 reason text not null check(length(trim(reason)) between 5 and 2000),
 kind text not null check(kind in ('holiday','suspension')), starts_on date not null, ends_on date not null,
 node_ids text[] not null default '{}', created_by uuid not null references public.rmc_profiles(id),
 created_at timestamptz not null default now(), check(ends_on>=starts_on and ends_on-starts_on<=365)
);
create index rmc_calendar_closures_dates on public.rmc_calendar_closures(starts_on,ends_on);
alter table public.rmc_calendar_closures enable row level security;
revoke all on public.rmc_calendar_closures from anon,authenticated;

create function app_private.calendar_scope(nodes text[], person jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select cardinality(nodes)=0 or nodes && app_private.path(coalesce(person#>>'{official_data,assignment_node_id}',person#>>'{school_data,academic_assignment,terminalGroupId}'));
$$;
create function app_private.session_suspended(ev public.rmc_events,person jsonb,session_day date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_calendar_closures c where app_private.calendar_scope(c.node_ids,person)
 and case when jsonb_array_length(app_private.ceremony_windows(ev.data,person))=0 then
 c.starts_on<=(ev.end_at at time zone 'Asia/Manila')::date and c.ends_on>=(ev.start_at at time zone 'Asia/Manila')::date
 else session_day between c.starts_on and c.ends_on end);
$$;

create function app_private.calendar_admin() returns void language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); begin
 if a.id is null or a.role_id<>'admin' then raise exception 'Only administrators can manage holidays and suspensions.' using errcode='42501'; end if;
 perform app_private.assert_permission('events.manage');
end $$;

create function app_private.preview_closure(first_day date,last_day date,nodes text[],shift_days integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare activities jsonb; token text;
begin
 perform app_private.calendar_admin();
 if first_day is null or last_day is null or first_day<(now() at time zone 'Asia/Manila')::date or last_day<first_day or last_day-first_day>365
 or nodes is null or cardinality(nodes)>100 or shift_days is null or shift_days not between 0 and 366 then raise exception 'Choose valid dates from today onwards, academic units, and a shift of 0–366 days.'; end if;
 if exists(select 1 from unnest(nodes) n where not exists(select 1 from public.rmc_nodes where id=n)) then raise exception 'An academic unit no longer exists.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.data->>'title','kind',e.data->>'kind',
 'starts_at',e.start_at,'ends_at',e.end_at,'organization',e.organization_id is not null,
 'affected',r.affected,'unaffected',r.total-r.affected,'can_change',r.total>0 and r.total=r.affected
 and (e.start_at at time zone 'Asia/Manila')::date>=first_day and (e.end_at at time zone 'Asia/Manila')::date<=last_day
 and e.start_at>now() and e.data->>'isGeneralEvent' is distinct from 'true'
 and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id)
 and (shift_days=0 or (e.data->>'kind'<>'flag_ceremony' and (e.start_at+make_interval(days=>shift_days) at time zone 'Asia/Manila')::date>last_day
 and (e.parent_event_id is null or exists(select 1 from public.rmc_events parent where parent.id=e.parent_event_id and e.start_at+make_interval(days=>shift_days)>=parent.start_at and e.end_at+make_interval(days=>shift_days)<=parent.end_at)))),
 'revision',md5(e.data::text||e.start_at::text||e.end_at::text),
 'new_starts_at',e.start_at+make_interval(days=>shift_days),'new_ends_at',e.end_at+make_interval(days=>shift_days)) order by e.start_at,e.id),'[]') into activities
 from public.rmc_events e cross join lateral (
 select count(*) total,count(*) filter(where app_private.calendar_scope(nodes,p.profile)) affected
 from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor','ssg')
 and app_private.recipient(e.data||jsonb_build_object('approvalStatus','approved'),p.profile)) r
 where e.start_at < (last_day+1)::timestamp at time zone 'Asia/Manila' and e.end_at>=first_day::timestamp at time zone 'Asia/Manila'
 and e.data->>'cancellationStatus' is null
 and (r.affected>0 or (r.total=0 and (cardinality(nodes)=0 or nodes && app_private.path(e.node_id))));
 token:=md5(jsonb_build_array(first_day,last_day,nodes,shift_days,activities,(select coalesce(jsonb_agg(id order by id),'[]') from public.rmc_calendar_closures))::text);
 return jsonb_build_object('activities',activities,'token',token);
end $$;

create function app_private.apply_closure(first_day date,last_day date,nodes text[],closure_title text,explanation text,closure_kind text,
 operation text,event_ids uuid[],shift_days integer,expected_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); preview jsonb; row jsonb; ev public.rmc_events; p public.rmc_profiles;
 cid uuid; att record; charge numeric; refund numeric;
begin
 perform app_private.calendar_admin();
 perform pg_advisory_xact_lock(hashtext('rmc-calendar-closures'));
 if coalesce(operation,'') not in ('suspend','cancel','reschedule') or event_ids is null or cardinality(event_ids)>500
 or coalesce(length(trim(closure_title)),0) not between 3 and 120 or coalesce(length(trim(explanation)),0) not between 5 and 2000 or coalesce(closure_kind,'') not in ('holiday','suspension')
 then raise exception 'Enter a title, official reason, and a valid action.'; end if;
 -- Lock in the same event-before-student order as scanners and finalization.
 perform 1 from public.rmc_events where start_at < (last_day+1)::timestamp at time zone 'Asia/Manila'
 and end_at>=first_day::timestamp at time zone 'Asia/Manila' order by id for update;
 preview:=app_private.preview_closure(first_day,last_day,nodes,shift_days);
 if expected_token is distinct from preview->>'token' then raise exception 'Schedules changed. Refresh the preview before applying.'; end if;
 if operation='suspend' and cardinality(event_ids)>0 then raise exception 'Suspension-only does not change event schedules.'; end if;
 if operation<>'suspend' and cardinality(event_ids)=0 then raise exception 'Select at least one eligible activity.'; end if;
 for ev in select * from public.rmc_events where id=any(event_ids) order by id loop
  select value into row from jsonb_array_elements(preview->'activities') where value->>'id'=ev.id::text;
  if row is null or (row->>'can_change')::boolean is not true then raise exception 'Only wholly affected, future activities without attendance can be changed together.'; end if;
  if operation='reschedule' then
   if shift_days<1 or (ev.start_at+make_interval(days=>shift_days) at time zone 'Asia/Manila')::date<=last_day then raise exception 'Move activities beyond the affected dates.'; end if;
   if exists(select 1 from public.rmc_calendar_closures c where c.starts_on<=(ev.end_at+make_interval(days=>shift_days) at time zone 'Asia/Manila')::date
    and c.ends_on>=(ev.start_at+make_interval(days=>shift_days) at time zone 'Asia/Manila')::date and
    exists(select 1 from public.rmc_profiles person where person.status='active' and app_private.recipient(ev.data||jsonb_build_object('approvalStatus','approved'),person.profile) and app_private.calendar_scope(c.node_ids,person.profile)))
   then raise exception 'The destination overlaps another holiday or suspension.'; end if;
   if ev.data->>'kind'='flag_ceremony' then raise exception 'Review ceremony exemptions and class windows individually before rescheduling.'; end if;
   update public.rmc_events set start_at=start_at+make_interval(days=>shift_days),end_at=end_at+make_interval(days=>shift_days),
    data=data||jsonb_build_object('startTime',extract(epoch from start_at+make_interval(days=>shift_days))*1000,
    'endTime',extract(epoch from end_at+make_interval(days=>shift_days))*1000,
    'startDate',to_char(start_at+make_interval(days=>shift_days) at time zone 'Asia/Manila','YYYY-MM-DD'),
    'endDate',to_char(end_at+make_interval(days=>shift_days) at time zone 'Asia/Manila','YYYY-MM-DD')) where id=ev.id;
  else
   update public.rmc_events set data=data||'{"status":"done","cancellationStatus":"cancelled"}',finalized_at=now() where id=ev.id;
  end if;
  insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'calendar.'||operation,ev.id::text,jsonb_build_object('before',ev.data,'shift_days',shift_days,'reason',explanation));
 end loop;
 if (select count(distinct v) from unnest(event_ids) v)<>(select count(*) from public.rmc_events where id=any(event_ids)) then raise exception 'An activity no longer exists.'; end if;
 insert into public.rmc_calendar_closures(title,reason,kind,starts_on,ends_on,node_ids,created_by)
 values(trim(closure_title),trim(explanation),closure_kind,first_day,last_day,nodes,a.id) returning id into cid;
 -- Today's already-finalized automatic absences are no longer requirements. Retain the ledger and append bounded reversals.
 for att in select t.* from public.rmc_attendance t join public.rmc_events e on e.id=t.event_id join public.rmc_profiles person on person.id=t.student_id
 where t.data->>'status'='absent' and t.data->>'time_in' is null and app_private.calendar_scope(nodes,person.profile)
 and case when t.slot='default' then (e.start_at at time zone 'Asia/Manila')::date<=last_day and (e.end_at at time zone 'Asia/Manila')::date>=first_day
 else substring(t.slot,1,10)::date between first_day and last_day end order by t.student_id,t.event_id,t.slot loop
  select * into p from public.rmc_profiles where id=att.student_id for update;
  select coalesce(sum((s.data->>'change')::numeric),0) into charge from public.rmc_sanctions s
   where s.source='absent:'||att.event_id||':'||att.student_id||':'||att.slot;
  refund:=least(greatest(charge,0),app_private.balance(p.id));
  if refund>0 then perform app_private.sanction(p.id,-refund,'Suspended attendance: '||closure_title,att.event_id,'closure:'||cid||':'||p.id||':'||att.event_id||':'||att.slot); end if;
  insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'calendar.absence_exempted',att.event_id::text,jsonb_build_object('closure_id',cid,'student_id',p.id,'slot',att.slot,'original',att.data,'sanction_change',-refund));
  delete from public.rmc_attendance where event_id=att.event_id and student_id=att.student_id and slot=att.slot;
 end loop;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 select id,'closure:'||cid,closure_title,first_day||' to '||last_day||' (Philippine time). '||explanation,'/student/calendar'
 from public.rmc_profiles where status='active' and role_id in ('student','mayor','ssg') and app_private.calendar_scope(nodes,profile);
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'calendar.closure_created',cid::text,jsonb_build_object('operation',operation,'event_ids',event_ids,'node_ids',nodes,'starts_on',first_day,'ends_on',last_day));
 return cid;
end $$;

create function app_private.personal_calendar(first_day date,last_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); items jsonb; closures jsonb;
begin
 if a.id is null then raise exception 'Sign in to view your calendar.' using errcode='42501'; end if;
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>62 then raise exception 'Choose a calendar range of up to 63 days.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text||':'||s.slot,'event_id',e.id,'title',e.data->>'title','label',s.label,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'kind',case when e.organization_id is not null then 'organization' else e.data->>'kind' end,
 'organization_id',e.organization_id,'general',coalesce((e.data->>'isGeneralEvent')::boolean,false),
 'cancelled',e.data->>'cancellationStatus' is not null,'suspended',app_private.session_suspended(e,a.profile,(s.starts_at at time zone 'Asia/Manila')::date),
 'venue',coalesce(e.data->>'venue',''),'description',coalesce(e.data->>'description','')) order by s.starts_at,e.id,s.slot),'[]') into items
 from public.rmc_events e cross join lateral app_private.calendar_sessions(e,a.profile) s
 where e.start_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and e.end_at>=first_day::timestamp at time zone 'Asia/Manila'
 and app_private.recipient(e.data,a.profile) and e.data->>'approvalStatus' is distinct from 'pending' and e.data->>'approvalStatus' is distinct from 'rejected'
 and s.ends_at>s.starts_at and s.starts_at<(last_day+1)::timestamp at time zone 'Asia/Manila' and s.ends_at>=first_day::timestamp at time zone 'Asia/Manila';
 select coalesce(jsonb_agg(to_jsonb(c)-'created_by'-'node_ids' order by c.starts_on,c.id),'[]') into closures
 from public.rmc_calendar_closures c where c.starts_on<=last_day and c.ends_on>=first_day and app_private.calendar_scope(c.node_ids,a.profile);
 return jsonb_build_object('items',items,'closures',closures);
end $$;

create function app_private.list_closures() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform app_private.calendar_admin(); return (select coalesce(jsonb_agg(to_jsonb(c) order by starts_on desc,created_at desc),'[]') from public.rmc_calendar_closures c); end $$;

create function public.rmc_preview_closure(first_day date,last_day date,nodes text[],shift_days integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select app_private.preview_closure(first_day,last_day,nodes,shift_days) $$;
create function public.rmc_apply_closure(first_day date,last_day date,nodes text[],closure_title text,explanation text,closure_kind text,operation text,event_ids uuid[],shift_days integer,expected_token text) returns uuid language sql security invoker set search_path='' as $$ select app_private.apply_closure(first_day,last_day,nodes,closure_title,explanation,closure_kind,operation,event_ids,shift_days,expected_token) $$;
create function public.rmc_personal_calendar(first_day date,last_day date) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.personal_calendar(first_day,last_day) $$;
create function public.rmc_calendar_closures() returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.list_closures() $$;
CREATE OR REPLACE FUNCTION app_private.calendar_sessions(ev rmc_events, person jsonb)
 RETURNS TABLE(slot text, starts_at timestamp with time zone, ends_at timestamp with time zone, late_at timestamp with time zone, label text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare windows jsonb:=app_private.ceremony_windows(ev.data,person); day date; w jsonb;
begin
 if jsonb_array_length(windows)=0 then
  return query select 'default'::text,ev.start_at,ev.end_at,ev.start_at+interval '15 minutes','Default session'::text;
 else
  for day in select generate_series((ev.start_at at time zone 'Asia/Manila')::date,(ev.end_at at time zone 'Asia/Manila')::date,interval '1 day')::date loop
   for w in select value from jsonb_array_elements(windows) loop
    return query select day::text||':'||(w->>'id'),
     greatest(ev.start_at,(day+(w->>'timeIn')::time) at time zone 'Asia/Manila'),
     least(ev.end_at,(day+(w->>'timeOut')::time) at time zone 'Asia/Manila'),
     ((day+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>coalesce((w->>'lateAfterMinutes')::int,15)),
     coalesce(w->>'label',w->>'id');
   end loop;
  end loop;
 end if;
end $function$
;
create or replace function app_private.correction_sessions(ev public.rmc_events,person jsonb)
returns table(slot text,starts_at timestamptz,ends_at timestamptz,late_at timestamptz,label text)
language sql stable set search_path='' as $$
 select s.* from app_private.calendar_sessions(ev,person) s
 where not app_private.session_suspended(ev,person,(s.starts_at at time zone 'Asia/Manila')::date)
$$;
CREATE OR REPLACE FUNCTION app_private.record_attendance(event_id uuid, student_id uuid, direction text, qr_token text, scan_position jsonb, manual_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
begin
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 if e.organization_id is not null and app_private.organization_manager(e.organization_id) then
  if a.id is null or app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is unavailable for this account or unit.'; end if;
 else
  perform app_private.assert_permission('attendance.scan',p.node_id);
 end if;
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is not null then
  if (app_private.resolve_qr(qr_token)->>'uid')::uuid<>p.id then raise exception 'QR does not match this student.'; end if;
 elsif coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 volunteer:=not app_private.recipient(e.data,p.profile) and app_private.ceremony_volunteer(e.data,p.profile);
 if not app_private.recipient(e.data,p.profile) and not volunteer then raise exception 'Student is not a recipient or eligible volunteer of this event.'; end if;
 if e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false) then raise exception 'Student is outside the ceremony scope.'; end if;
 if app_private.session_suspended(e,p.profile,local_now::date) then raise exception 'Attendance is suspended for this student and session.'; end if;
 windows:=app_private.ceremony_windows(e.data,p.profile);
 if e.data->>'cancellationStatus' is not null or e.data->>'status'='done' or now()<e.start_at or now()>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(windows)>0 then
  select value into w from jsonb_array_elements(windows) where local_now::time>=(value->>'timeIn')::time
   and (local_now::time<(value->>'timeOut')::time or (direction='out' and local_now::time=(value->>'timeOut')::time))
   order by case when direction='out' and exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=local_now::date::text||':'||(value->>'id') and att.data->>'time_out' is null) then 0 else 1 end, value->>'timeIn' limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record is not null then return record||'{"already_recorded":true}'; end if;
  if e.data->>'kind' in ('service','merit') and exists(select 1 from public.rmc_attendance att join public.rmc_events other on other.id=att.event_id
   where att.student_id=p.id and att.event_id<>e.id and att.data->>'time_in' is not null and att.data->>'time_out' is null
    and other.data->>'kind' in ('service','merit') and other.end_at>=now() and other.data->>'cancellationStatus' is null) then
   raise exception 'Scan out of the other service or merit activity before starting this one.';
  end if;
  status:=case when now()>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'manual' else 'qr' end,'manual_reason',manual_reason,'volunteer',volunteer);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if not volunteer and status='late' and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null then raise exception 'Scan in before scanning out.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  window_start:=case when w is null then extract(epoch from e.start_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila'))*1000 end;
  window_end:=case when w is null then extract(epoch from e.end_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeOut')::time) at time zone 'Asia/Manila'))*1000 end;
  rendered:=round(greatest(0,least(stamp,window_end,extract(epoch from e.end_at)*1000)-greatest((record->>'time_in')::numeric,window_start,extract(epoch from e.start_at)*1000))/3600000,6);
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',rendered);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
  if e.data->>'kind'='merit' then
   completed:=not exists(
    select 1 from generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day') day
    cross join lateral jsonb_array_elements(case when jsonb_array_length(windows)>0 then windows else '[{"id":"default"}]'::jsonb end) win
    where not app_private.session_suspended(e,p.profile,day::date) and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
     and att.slot=case when win->>'id'='default' then 'default' else day::date::text||':'||(win->>'id') end
     and att.data->>'time_in' is not null and att.data->>'time_out' is not null)
   );
  end if;
  earned:=case when volunteer then case when e.data#>>'{ceremony,allowVolunteerMerit}'='true' then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else 0 end
   when e.data->>'kind'='service' then rendered when e.data->>'kind'='merit' and completed then (e.data->>'meritHours')::numeric else 0 end;
  source_key:=case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end;
  if exists(select 1 from public.rmc_sanctions where source=source_key) or exists(select 1 from public.rmc_merit_credits where source=source_key) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  excess:=case when (e.data->>'kind'='service' and e.data#>>'{service,overflow}'='merit') or e.data->>'kind'='merit' then round(greatest(0,earned-deducted),6) else 0 end;
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Completed activity: '||(e.data->>'title'),e.id,source_key); end if;
  if excess>0 then insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(p.id,e.id,source_key,excess,a.id); end if;
  record:=record||jsonb_build_object('deducted_hours',deducted,'merit_earned_hours',excess,'awarded_hours',earned,'completion_pending',e.data->>'kind'='merit' and not completed);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $function$
;
CREATE OR REPLACE FUNCTION app_private.record_offline_attendance_at(event_id uuid, student_id uuid, direction text, qr_token text, scan_position jsonb, manual_reason text, captured_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=captured_at at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from captured_at)*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric; volunteer boolean; windows jsonb; rendered numeric; excess numeric; completed boolean:=false; source_key text; window_start numeric; window_end numeric;
begin
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 if e.organization_id is not null and app_private.organization_manager(e.organization_id) then
  if a.id is null or app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is unavailable for this account or unit.'; end if;
 else
  perform app_private.assert_permission('attendance.scan',p.node_id);
 end if;
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is null and coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 volunteer:=not app_private.recipient(e.data,p.profile) and app_private.ceremony_volunteer(e.data,p.profile);
 if not app_private.recipient(e.data,p.profile) and not volunteer then raise exception 'Student is not a recipient or eligible volunteer of this event.'; end if;
 if e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false) then raise exception 'Student is outside the ceremony scope.'; end if;
 if app_private.session_suspended(e,p.profile,local_now::date) then raise exception 'Attendance is suspended for this student and session.'; end if;
 windows:=app_private.ceremony_windows(e.data,p.profile);
 if e.data->>'cancellationStatus' is not null or captured_at<e.start_at or captured_at>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(windows)>0 then
  select value into w from jsonb_array_elements(windows) where local_now::time>=(value->>'timeIn')::time
   and (local_now::time<(value->>'timeOut')::time or (direction='out' and local_now::time=(value->>'timeOut')::time))
   order by case when direction='out' and exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=local_now::date::text||':'||(value->>'id') and att.data->>'time_out' is null) then 0 else 1 end, value->>'timeIn' limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record->>'status'='absent' then
   if record->>'scanned_by_name' is distinct from 'System' or record->>'time_in' is not null then raise exception 'This absence was manually reviewed. Review the queued scan.' using errcode='22023'; end if;
   delete from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=slot_id;
   delete from public.rmc_sanctions where source='absent:'||e.id::text||':'||p.id::text||':'||slot_id;
   record:=null;
  end if;
  if record is not null and coalesce(record->>'status','') not in ('present','late') then raise exception 'Attendance was reviewed or excused. Review the queued scan.' using errcode='22023'; end if;
  if record is not null then return record||'{"already_recorded":true}'; end if;
  if e.data->>'kind' in ('service','merit') and exists(select 1 from public.rmc_attendance att join public.rmc_events other on other.id=att.event_id
   where att.student_id=p.id and att.event_id<>e.id and att.data->>'time_in' is not null and att.data->>'time_out' is null
    and other.data->>'kind' in ('service','merit') and other.end_at>=captured_at and other.data->>'cancellationStatus' is null) then
   raise exception 'Scan out of the other service or merit activity before starting this one.';
  end if;
  status:=case when captured_at>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'offline_manual' else 'offline_qr' end,'manual_reason',manual_reason,'volunteer',volunteer);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if not volunteer and status='late' and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null or record->>'time_in' is null then raise exception 'Scan in before scanning out.'; end if;
  if stamp<(record->>'time_in')::numeric then raise exception 'Scan-out predates the saved scan-in. Review the device clock or conflicting record.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  window_start:=case when w is null then extract(epoch from e.start_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila'))*1000 end;
  window_end:=case when w is null then extract(epoch from e.end_at)*1000 else extract(epoch from ((local_now::date+(w->>'timeOut')::time) at time zone 'Asia/Manila'))*1000 end;
  rendered:=round(greatest(0,least(stamp,window_end,extract(epoch from e.end_at)*1000)-greatest((record->>'time_in')::numeric,window_start,extract(epoch from e.start_at)*1000))/3600000,6);
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',rendered);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
  if e.data->>'kind'='merit' then
   completed:=not exists(
    select 1 from generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day') day
    cross join lateral jsonb_array_elements(case when jsonb_array_length(windows)>0 then windows else '[{"id":"default"}]'::jsonb end) win
    where not app_private.session_suspended(e,p.profile,day::date) and not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
     and att.slot=case when win->>'id'='default' then 'default' else day::date::text||':'||(win->>'id') end
     and att.data->>'time_in' is not null and att.data->>'time_out' is not null)
   );
  end if;
  earned:=case when volunteer then case when e.data#>>'{ceremony,allowVolunteerMerit}'='true' then (e.data#>>'{ceremony,volunteerMeritHours}')::numeric else 0 end
   when e.data->>'kind'='service' then rendered when e.data->>'kind'='merit' and completed then (e.data->>'meritHours')::numeric else 0 end;
  source_key:=case when volunteer or e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end;
  if exists(select 1 from public.rmc_sanctions where source=source_key) or exists(select 1 from public.rmc_merit_credits where source=source_key) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  excess:=case when (e.data->>'kind'='service' and e.data#>>'{service,overflow}'='merit') or e.data->>'kind'='merit' then round(greatest(0,earned-deducted),6) else 0 end;
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Completed activity: '||(e.data->>'title'),e.id,source_key); end if;
  if excess>0 then insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(p.id,e.id,source_key,excess,a.id); end if;
  record:=record||jsonb_build_object('deducted_hours',deducted,'merit_earned_hours',excess,'awarded_hours',earned,'completion_pending',e.data->>'kind'='merit' and not completed);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id,'captured_at',stamp,'synced_at',extract(epoch from now())*1000,'offline',true));
 return record||'{"already_recorded":false}';
end $function$
;
CREATE OR REPLACE FUNCTION app_private.finalize_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.rmc_events; p public.rmc_profiles; w jsonb; day date; slot_id text; penalty numeric; state text;
begin
 for e in select * from public.rmc_events where end_at<now() and finalized_at is null order by end_at for update skip locked limit 50 loop
  if coalesce(e.data->>'isGeneralEvent','false')<>'true' and e.data->>'cancellationStatus' is null and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   penalty:=coalesce((e.data#>>'{sanctionRules,absent,value}')::numeric,(e.data->>'penaltyValue')::numeric,0)/case when coalesce(e.data#>>'{sanctionRules,absent,unit}',e.data->>'penaltyUnit')='minutes' then 60 else 1 end;
   for p in select * from public.rmc_profiles where status='active' and role_id in ('student','mayor','ssg') and created_at<=e.start_at loop
    if not app_private.recipient(e.data,p.profile) then continue; end if;
    state:=case when exists(select 1 from public.rmc_excuses where event_id=e.id and student_id=p.id and data->>'status'='approved') then 'excused' else 'absent' end;
    for day in select generate_series((e.start_at at time zone 'Asia/Manila')::date,(e.end_at at time zone 'Asia/Manila')::date,interval '1 day')::date loop
     for w in select value from jsonb_array_elements(case when jsonb_array_length(coalesce(e.data->'attendanceWindows','[]'))>0 then app_private.ceremony_windows(e.data,p.profile) else '[{"id":"default"}]' end) loop
      if app_private.session_suspended(e,p.profile,day) then continue; end if;
      slot_id:=case when w->>'id'='default' then 'default' else day::text||':'||(w->>'id') end;
      insert into public.rmc_attendance values(e.id,p.id,slot_id,jsonb_build_object('status',state,'slot',slot_id,'scanned_by_name','System','recorded_at',extract(epoch from now())*1000)) on conflict do nothing;
      if found and state='absent' and penalty>0 then perform app_private.sanction(p.id,penalty,'Absent: '||(e.data->>'title'),e.id,'absent:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
     end loop;
    end loop;
   end loop;
  end if;
  update public.rmc_events set finalized_at=now(),data=data||'{"status":"done"}' where id=e.id;
 end loop;
 delete from app_private.qr_tokens where expires_at<now()-interval '1 hour';
end $function$
;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') and p.proname in
 ('calendar_scope','session_suspended','calendar_admin','calendar_sessions','preview_closure','apply_closure','personal_calendar','list_closures',
 'rmc_preview_closure','rmc_apply_closure','rmc_personal_calendar','rmc_calendar_closures') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname like 'rmc_%' or f.proname in ('preview_closure','apply_closure','personal_calendar','list_closures') then
  execute format('grant execute on function %s to authenticated',f.signature);
 end if;
 end loop; end $$;

