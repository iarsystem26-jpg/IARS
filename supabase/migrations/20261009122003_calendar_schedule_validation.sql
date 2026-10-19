-- Parenthesize shifted timestamps before Manila conversion.
create or replace function app_private.preview_closure(first_day date,last_day date,nodes text[],shift_days integer default 0) returns jsonb
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
 and (shift_days=0 or (e.data->>'kind'<>'flag_ceremony' and ((e.start_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila')::date>last_day
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

create or replace function app_private.apply_closure(first_day date,last_day date,nodes text[],closure_title text,explanation text,closure_kind text,
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
   if shift_days<1 or ((ev.start_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila')::date<=last_day then raise exception 'Move activities beyond the affected dates.'; end if;
   if exists(select 1 from public.rmc_calendar_closures c where c.starts_on<=((ev.end_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila')::date
    and c.ends_on>=((ev.start_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila')::date and
    exists(select 1 from public.rmc_profiles person where person.status='active' and app_private.recipient(ev.data||jsonb_build_object('approvalStatus','approved'),person.profile) and app_private.calendar_scope(c.node_ids,person.profile)))
   then raise exception 'The destination overlaps another holiday or suspension.'; end if;
   if ev.data->>'kind'='flag_ceremony' then raise exception 'Review ceremony exemptions and class windows individually before rescheduling.'; end if;
   update public.rmc_events set start_at=start_at+make_interval(days=>shift_days),end_at=end_at+make_interval(days=>shift_days),
    data=data||jsonb_build_object('startTime',extract(epoch from start_at+make_interval(days=>shift_days))*1000,
    'endTime',extract(epoch from end_at+make_interval(days=>shift_days))*1000,
    'startDate',to_char((start_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila','YYYY-MM-DD'),
    'endDate',to_char((end_at+make_interval(days=>shift_days)) at time zone 'Asia/Manila','YYYY-MM-DD')) where id=ev.id;
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

