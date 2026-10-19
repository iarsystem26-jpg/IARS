begin;
-- Signed adjustment entries preserve the original earned-merit awards.
alter table public.rmc_merit_credits drop constraint rmc_merit_credits_hours_check;
alter table public.rmc_merit_credits add constraint rmc_merit_credits_hours_check check(hours<>0);
alter table public.rmc_attendance_corrections add column kind text not null default 'attendance',
 add column credit_context jsonb, add column credit_adjustment jsonb;

create or replace function app_private.correction_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); result jsonb;
begin
 if a.id is null or a.role_id not in ('student','mayor','ssg') or app_private.access_frozen() then
  raise exception 'An active student account is required.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('event_id',e.id,'event_title',e.data->>'title','slot',s.slot,
 'label',s.label,'starts_at',s.starts_at,'ends_at',s.ends_at,'late_at',s.late_at,'original',att.data,'kind',coalesce(e.data->>'kind','attendance'))
 order by s.starts_at desc,e.id,s.slot),'[]') into result
 from public.rmc_events e cross join lateral app_private.correction_sessions(e,a.profile) s
 left join public.rmc_attendance att on att.event_id=e.id and att.student_id=a.id and att.slot=s.slot
 where e.end_at<now() and e.end_at>=now()-interval '30 days' and a.created_at<=e.start_at
 and coalesce(e.data->>'kind','attendance') in ('attendance','flag_ceremony','service','merit')
 and coalesce(e.data->>'isGeneralEvent','false')<>'true' and e.organization_id is null
 and nullif(e.data->>'cancellationStatus','') is null
 and coalesce(e.data->>'approvalStatus','approved') not in ('pending','rejected')
 and coalesce(e.data->>'status','') not in ('pending','rejected')
 and not app_private.frozen(e.node_id) and s.ends_at>s.starts_at
 and (app_private.recipient(e.data,a.profile) or (att.data is not null and coalesce(att.data->>'volunteer','false')<>'true'))
 and coalesce(att.data->>'volunteer','false')<>'true' and coalesce(att.data->>'status','')<>'excused'
 and not exists(select 1 from public.rmc_excuses x where x.student_id=a.id and x.event_id=e.id and x.data->>'status' in ('pending','approved'))
 and not exists(select 1 from public.rmc_attendance_corrections c where c.student_id=a.id and c.event_id=e.id and c.slot=s.slot and c.status='pending');
 return result;
end $$;


-- Capture every session and the relevant award entries, including earlier corrections.
create function app_private.correction_credit_context(ev public.rmc_events,student uuid,target_slot text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('event',ev.data,'start',ev.start_at,'end',ev.end_at,
 'attendance',coalesce((select jsonb_object_agg(slot,data) from public.rmc_attendance where event_id=ev.id and student_id=student),'{}'),
 'sanctions',coalesce((select jsonb_agg(jsonb_build_object('source',source,'change',data->'change') order by source) from public.rmc_sanctions
 where student_id=student and event_id=ev.id and (source=case when ev.data->>'kind'='merit' then 'merit:'||ev.id||':'||student else 'service:'||ev.id||':'||student||':'||target_slot end
 or starts_with(source,case when ev.data->>'kind'='merit' then 'merit:'||ev.id||':'||student else 'service:'||ev.id||':'||student||':'||target_slot end||':correction:'))),'[]'),
 'merit',coalesce((select jsonb_agg(jsonb_build_object('source',source,'hours',hours) order by source) from public.rmc_merit_credits
 where student_id=student and event_id=ev.id and (source=case when ev.data->>'kind'='merit' then 'merit:'||ev.id||':'||student else 'service:'||ev.id||':'||student||':'||target_slot end
 or starts_with(source,case when ev.data->>'kind'='merit' then 'merit:'||ev.id||':'||student else 'service:'||ev.id||':'||student||':'||target_slot end||':correction:'))),'[]'))
$$;
create function app_private.capture_correction_credit_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev public.rmc_events;
begin
 select * into strict ev from public.rmc_events where id=new.event_id;
 new.kind:=coalesce(ev.data->>'kind','attendance');
 if new.kind in ('service','merit') then new.credit_context:=app_private.correction_credit_context(ev,new.student_id,new.slot); end if;
 return new;
end $$;
create trigger capture_correction_credit_context before insert on public.rmc_attendance_corrections
 for each row execute function app_private.capture_correction_credit_context();

-- Shared calculation: both preview and approval use the same verified session times.
create function app_private.correction_credit_plan(c public.rmc_attendance_corrections,verified_in timestamptz,verified_out timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ev public.rmc_events; p public.rmc_profiles; s record; ctx jsonb; att jsonb; old_d numeric; old_m numeric;
 old_rendered numeric; rendered numeric:=0; desired numeric; new_d numeric; new_m numeric; extra numeric; balance numeric; complete boolean; award numeric;
begin
 select * into strict ev from public.rmc_events where id=c.event_id;
 select * into strict p from public.rmc_profiles where id=c.student_id;
 if c.kind not in ('service','merit') or ev.data->>'kind' is distinct from c.kind or ev.organization_id is not null then raise exception 'Unsupported credit correction.'; end if;
 if app_private.frozen(p.node_id) or app_private.frozen(ev.node_id) or p.status<>'active' or exists(select 1 from public.rmc_account_freezes where account_id=p.id) then raise exception 'Student or activity operations are frozen or inactive.'; end if;
 if nullif(ev.data->>'cancellationStatus','') is not null or ev.data->>'approvalStatus' in ('pending','rejected') or ev.data->>'status' in ('pending','rejected') then raise exception 'This activity is cancelled or unapproved.'; end if;
 if ev.end_at>=now() then raise exception 'Wait until the activity has ended.'; end if;
 if exists(select 1 from public.rmc_excuses where event_id=ev.id and student_id=p.id and data->>'status' in ('pending','approved')) then raise exception 'Resolve the pending or approved excuse with OSSA first.'; end if;
 ctx:=app_private.correction_credit_context(ev,p.id,c.slot);
 if ctx is distinct from c.credit_context then raise exception 'Attendance or credits changed after submission. Reject and resubmit against the latest records.'; end if;
 select * into s from app_private.correction_sessions(ev,p.profile) where slot=c.slot;
 if s.slot is null or s.ends_at<=s.starts_at then raise exception 'The session configuration changed.'; end if;
 if s.starts_at is distinct from c.session_starts_at or s.ends_at is distinct from c.session_ends_at or s.late_at is distinct from c.session_late_at then raise exception 'The session configuration changed. Reject and resubmit.'; end if;
 if verified_in is not null and (not isfinite(verified_in) or verified_in<s.starts_at or verified_in>s.ends_at) then raise exception 'Verified time-in must be within the session.'; end if;
 if verified_out is not null and (verified_in is null or not isfinite(verified_out) or verified_out<verified_in or verified_out>s.ends_at) then raise exception 'Verified time-out must follow time-in within the session.'; end if;
 -- Completed and open participation in any other service/merit session cannot overlap.
 if verified_in is not null and exists(select 1 from public.rmc_attendance a join public.rmc_events e on e.id=a.event_id
 where a.student_id=p.id and e.data->>'kind' in ('service','merit') and not(a.event_id=ev.id and a.slot=c.slot)
 and a.data->>'time_in' is not null and to_timestamp((a.data->>'time_in')::numeric/1000)<coalesce(verified_out,s.ends_at)
 and coalesce(to_timestamp((a.data->>'time_out')::numeric/1000),e.end_at)>verified_in) then raise exception 'Verified participation overlaps another service or merit session. Resolve that record first.'; end if;
 if verified_out is not null then rendered:=round(extract(epoch from verified_out-verified_in)/3600,6); end if;
 old_rendered:=coalesce((c.original->>'rendered_hours')::numeric,0);
 select greatest(0,-coalesce(sum((value->>'change')::numeric),0)) into old_d from jsonb_array_elements(ctx->'sanctions');
 select greatest(0,coalesce(sum((value->>'hours')::numeric),0)) into old_m from jsonb_array_elements(ctx->'merit');
 balance:=app_private.balance(p.id);
 att:=ctx->'attendance';
 att:=jsonb_set(att,array[c.slot],jsonb_strip_nulls(jsonb_build_object('time_in',case when verified_in is not null then extract(epoch from verified_in)*1000 end,'time_out',case when verified_out is not null then extract(epoch from verified_out)*1000 end)));
 select not exists(select 1 from app_private.correction_sessions(ev,p.profile) x where x.ends_at>x.starts_at
 and (att->x.slot->>'time_in' is null or att->x.slot->>'time_out' is null)) into complete;
 award:=coalesce((ev.data->>'meritHours')::numeric,0);
 if c.kind='merit' and (award<0.01 or award>24) then raise exception 'Invalid fixed merit award. Contact administration.'; end if;
 desired:=case when c.kind='service' then rendered when complete then award else 0 end;
 -- Reductions revoke saved merit first, then restore the sanctions previously cleared.
 new_d:=least(old_d,desired); new_m:=least(old_m,greatest(0,desired-new_d));
 extra:=case when c.kind='service' then greatest(0,rendered-old_rendered) else greatest(0,desired-old_d-old_m) end;
 new_d:=new_d+least(balance,extra);
 if c.kind='merit' or ev.data#>>'{service,overflow}'='merit' then new_m:=new_m+greatest(0,extra-balance); end if;
 return jsonb_build_object('rendered_before',old_rendered,'rendered_after',rendered,'cleared_before',old_d,'cleared_after',new_d,
 'merit_before',old_m,'merit_after',new_m,'sanction_change',old_d-new_d,'merit_change',new_m-old_m,
 'balance_before',balance,'balance_after',balance+old_d-new_d,'complete',complete,'kind',c.kind);
end $$;

create function app_private.preview_correction_credit(request_id uuid,verified_in timestamptz,verified_out timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.rmc_attendance_corrections; a public.rmc_profiles:=app_private.actor();
begin
 select * into strict c from public.rmc_attendance_corrections where id=request_id;
 if a.id is null or not app_private.session_allowed() or app_private.access_frozen() or
 (a.id<>c.student_id and not app_private.correction_reviewer(c.student_id)) then raise exception 'Authorized access is required.' using errcode='42501'; end if;
 if c.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 return app_private.correction_credit_plan(c,verified_in,verified_out);
end $$;

alter function app_private.review_attendance_correction(uuid,text,text,timestamptz,timestamptz) rename to review_institutional_attendance_correction;
revoke all on function app_private.review_institutional_attendance_correction(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
drop function public.rmc_review_attendance_correction(uuid,text,text,timestamptz,timestamptz);
create function app_private.review_attendance_correction(request_id uuid,decision text,note text,verified_in timestamptz,verified_out timestamptz,expected_credit jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); c public.rmc_attendance_corrections; ev public.rmc_events; p public.rmc_profiles;
 plan jsonb; result jsonb; source_key text; delta numeric; merit_delta numeric; new_status text;
begin
 select * into strict c from public.rmc_attendance_corrections where id=request_id;
 if c.kind not in ('service','merit') then
  perform app_private.review_institutional_attendance_correction(request_id,decision,note,verified_in,verified_out); return;
 end if;
 if not app_private.correction_reviewer(c.student_id) or a.id=c.student_id then raise exception 'An authorized reviewer is required; self-review is unavailable.' using errcode='42501'; end if;
 select * into strict ev from public.rmc_events where id=c.event_id for share;
 select * into strict p from public.rmc_profiles where id=c.student_id for update;
 select * into strict c from public.rmc_attendance_corrections where id=request_id for update;
 if not app_private.correction_reviewer(c.student_id) then raise exception 'Student scope changed. Refresh the queue.' using errcode='42501'; end if;
 if c.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 if coalesce(length(trim(note)),0) not between 5 and 2000 then raise exception 'Provide decision notes between 5 and 2000 characters.'; end if;
 if decision='approved' then
  plan:=app_private.correction_credit_plan(c,verified_in,verified_out);
  if expected_credit is null or expected_credit is distinct from plan then raise exception 'Credit preview changed. Refresh the preview and review the balances before approval.'; end if;
  delta:=(plan->>'sanction_change')::numeric; merit_delta:=(plan->>'merit_change')::numeric;
  source_key:=case when c.kind='merit' then 'merit:'||ev.id||':'||p.id else 'service:'||ev.id||':'||p.id||':'||c.slot end;
  -- Reserve the scanner award key even for zero-hour/missing-record corrections.
  if not exists(select 1 from public.rmc_sanctions where source=source_key) then perform app_private.sanction(p.id,0,'Credit correction award marker',ev.id,source_key); end if;
  if delta<>0 then perform app_private.sanction(p.id,delta,'Credit correction: '||c.event_title||' / '||c.slot||' - '||trim(note),ev.id,source_key||':correction:'||c.id); end if;
  if merit_delta<>0 then insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(p.id,ev.id,source_key||':correction:'||c.id,merit_delta,a.id); end if;
  new_status:=case when verified_in is null then 'absent' when verified_in>c.session_late_at then 'late' else 'present' end;
  result:=(coalesce(c.original,'{}')-'time_in'-'time_out')||jsonb_build_object('status',new_status,'slot',c.slot,'method','correction',
  'correction_id',c.id,'corrected_by_uid',a.id,'corrected_by_name',a.profile->>'name','corrected_at',extract(epoch from now())*1000,'correction_note',trim(note),
  'rendered_hours',plan->'rendered_after','deducted_hours',plan->'cleared_after','merit_earned_hours',plan->'merit_after',
  'awarded_hours',(plan->>'cleared_after')::numeric+(plan->>'merit_after')::numeric,'completion_pending',c.kind='merit' and not (plan->>'complete')::boolean);
  if verified_in is not null then result:=result||jsonb_build_object('time_in',extract(epoch from verified_in)*1000); end if;
  if verified_out is not null then result:=result||jsonb_build_object('time_out',extract(epoch from verified_out)*1000); end if;
  if c.original is null then result:=result||jsonb_build_object('recorded_at',extract(epoch from now())*1000,'scanned_by_name','Not scanned; corrected by OSSA'); end if;
  -- A fixed award belongs to the whole activity. Remove stale award labels from other sessions.
  if c.kind='merit' then update public.rmc_attendance set data=data||jsonb_build_object('deducted_hours',0,'merit_earned_hours',0,'awarded_hours',0,'completion_pending',not(plan->>'complete')::boolean)
   where event_id=ev.id and student_id=p.id and slot<>c.slot; end if;
  insert into public.rmc_attendance(event_id,student_id,slot,data) values(ev.id,p.id,c.slot,result) on conflict(event_id,student_id,slot) do update set data=excluded.data;
 end if;
 update public.rmc_attendance_corrections set status=decision,reviewed_at=now(),reviewer_id=a.id,reviewer_name=a.profile->>'name',review_note=trim(note),
 corrected=result,sanction_change=coalesce(delta,0),credit_adjustment=plan where id=c.id;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.correction.'||decision,p.id::text,
 jsonb_build_object('request_id',c.id,'event_id',ev.id,'slot',c.slot,'original',c.original,'corrected',result,'credit_adjustment',plan,'actor_name',a.profile->>'name','target_name',c.student_name));
end $$;
create function public.rmc_preview_correction_credit(request_id uuid,verified_in timestamptz default null,verified_out timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.preview_correction_credit(request_id,verified_in,verified_out) $$;
create function public.rmc_review_attendance_correction(request_id uuid,decision text,note text,verified_in timestamptz default null,verified_out timestamptz default null,expected_credit jsonb default null) returns void
language sql security invoker set search_path='' as $$ select app_private.review_attendance_correction(request_id,decision,note,verified_in,verified_out,expected_credit) $$;
revoke all on function app_private.correction_credit_context(public.rmc_events,uuid,text),app_private.capture_correction_credit_context(),
 app_private.correction_credit_plan(public.rmc_attendance_corrections,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function app_private.preview_correction_credit(uuid,timestamptz,timestamptz),public.rmc_preview_correction_credit(uuid,timestamptz,timestamptz),
 app_private.review_attendance_correction(uuid,text,text,timestamptz,timestamptz,jsonb),public.rmc_review_attendance_correction(uuid,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function app_private.preview_correction_credit(uuid,timestamptz,timestamptz),public.rmc_preview_correction_credit(uuid,timestamptz,timestamptz),
 app_private.review_attendance_correction(uuid,text,text,timestamptz,timestamptz,jsonb),public.rmc_review_attendance_correction(uuid,text,text,timestamptz,timestamptz,jsonb) to authenticated;
commit;
