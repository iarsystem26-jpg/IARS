begin;
-- Corrected checkout times must also update the displayed rendered duration.
create or replace function app_private.review_attendance_correction(request_id uuid,decision text,note text,
 verified_in timestamptz,verified_out timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); c public.rmc_attendance_corrections; e public.rmc_events; p public.rmc_profiles;
 session record; before_record jsonb; after_record jsonb; new_status text; charged numeric; desired numeric; delta numeric; previous_balance numeric;
begin
 select * into strict c from public.rmc_attendance_corrections where id=request_id;
 if not app_private.correction_reviewer(c.student_id) or a.id=c.student_id then raise exception 'An authorized reviewer in the student scope is required; self-review is unavailable.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=c.event_id for share;
 select * into strict p from public.rmc_profiles where id=c.student_id for update;
 select * into strict c from public.rmc_attendance_corrections where id=request_id for update;
 if not app_private.correction_reviewer(c.student_id) then raise exception 'Student scope changed. Refresh the queue.' using errcode='42501'; end if;
 if c.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 if coalesce(length(trim(note)),0) not between 5 and 2000 then raise exception 'Provide decision notes between 5 and 2000 characters.'; end if;
 if decision='approved' then
  if app_private.frozen(p.node_id) or app_private.frozen(e.node_id) or exists(select 1 from public.rmc_account_freezes where account_id=p.id) or p.status<>'active' then raise exception 'Student or activity operations are frozen or inactive.'; end if;
  if nullif(e.data->>'cancellationStatus','') is not null or e.data->>'approvalStatus' in ('pending','rejected') or e.data->>'status' in ('pending','rejected') then raise exception 'This activity is cancelled or unapproved.'; end if;
  if exists(select 1 from public.rmc_excuses x where x.event_id=e.id and x.student_id=p.id and x.data->>'status' in ('pending','approved')) then raise exception 'Resolve the pending or approved excuse with OSSA first.'; end if;
  select data into before_record from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id and att.slot=c.slot for update;
  if before_record is distinct from c.original then raise exception 'Attendance changed after submission. Reject this request and ask the student to resubmit against the latest record.'; end if;
  select * into session from app_private.correction_sessions(e,p.profile) s where s.slot=c.slot;
  if session.slot is null or session.ends_at<=session.starts_at then raise exception 'The session configuration changed. Contact administration.'; end if;
  if verified_in is not null and (not isfinite(verified_in) or verified_in<session.starts_at or verified_in>session.ends_at) then raise exception 'Verified time-in must be within the session.'; end if;
  if verified_out is not null and (verified_in is null or not isfinite(verified_out) or verified_out<verified_in or verified_out>session.ends_at) then raise exception 'Verified time-out must follow time-in within the session.'; end if;
  new_status:=case when verified_in is null then 'absent' when verified_in>session.late_at then 'late' else 'present' end;
  after_record:=(coalesce(before_record,'{}')-'time_in'-'time_out'-'rendered_hours')||jsonb_build_object('status',new_status,'slot',c.slot,
    'method','correction','correction_id',c.id,'corrected_by_uid',a.id,'corrected_by_name',a.profile->>'name',
    'corrected_at',extract(epoch from now())*1000,'correction_note',trim(note));
  if verified_in is not null then after_record:=after_record||jsonb_build_object('time_in',extract(epoch from verified_in)*1000); end if;
  if verified_out is not null then after_record:=after_record||jsonb_build_object('time_out',extract(epoch from verified_out)*1000,
   'rendered_hours',round(extract(epoch from (verified_out-verified_in))/3600,6)); end if;
  if before_record is null then after_record:=after_record||jsonb_build_object('recorded_at',extract(epoch from now())*1000,'scanned_by_name','Not scanned; corrected by OSSA'); end if;
  select greatest(0,coalesce(sum((s.data->>'change')::numeric),0)) into charged from public.rmc_sanctions s
   where s.student_id=p.id and s.event_id=e.id and (s.source in ('late:'||e.id||':'||p.id||':'||c.slot,'absent:'||e.id||':'||p.id||':'||c.slot)
   or s.source like 'correction:'||e.id||':'||p.id||':'||c.slot||':%');
  desired:=case new_status when 'late' then coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end
   when 'absent' then coalesce((e.data#>>'{sanctionRules,absent,value}')::numeric,(e.data->>'penaltyValue')::numeric,0)/case when coalesce(e.data#>>'{sanctionRules,absent,unit}',e.data->>'penaltyUnit')='minutes' then 60 else 1 end else 0 end;
  -- The assessed penalty is separate from the actual balance deduction (which may
  -- be capped after service/waivers). Later corrections must not deduct it twice.
  charged:=coalesce((before_record->>'assessed_sanction_hours')::numeric,charged);
  after_record:=after_record||jsonb_build_object('assessed_sanction_hours',desired);
  previous_balance:=app_private.balance(p.id);
  delta:=greatest(-previous_balance,desired-charged);
  if delta<>0 then perform app_private.sanction(p.id,delta,'Attendance correction: '||c.event_title||' / '||c.slot||' - '||trim(note),e.id,
   'correction:'||e.id||':'||p.id||':'||c.slot||':'||c.id); end if;
  insert into public.rmc_attendance(event_id,student_id,slot,data) values(e.id,p.id,c.slot,after_record)
   on conflict(event_id,student_id,slot) do update set data=excluded.data;
 end if;
 update public.rmc_attendance_corrections set status=decision,reviewed_at=now(),reviewer_id=a.id,
 reviewer_name=a.profile->>'name',review_note=trim(note),corrected=after_record,sanction_change=coalesce(delta,0) where id=c.id;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.correction.'||decision,p.id::text,
 jsonb_build_object('request_id',c.id,'event_id',e.id,'slot',c.slot,'original',c.original,'corrected',after_record,
 'sanction_change',coalesce(delta,0),'actor_name',a.profile->>'name','target_name',c.student_name));
end $$;
commit;
