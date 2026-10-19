begin;

create table public.rmc_attendance_corrections (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.rmc_profiles(id) on delete restrict,
 event_id uuid not null references public.rmc_events(id) on delete restrict,
 slot text not null,
 session_starts_at timestamptz not null, session_ends_at timestamptz not null, session_late_at timestamptz not null,
 student_name text not null, student_number text not null, event_title text not null,
 reason text not null check (length(trim(reason)) between 10 and 2000),
 proof_url text,
 proposed_time_in timestamptz, proposed_time_out timestamptz,
 original jsonb, corrected jsonb,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewer_id uuid references public.rmc_profiles(id) on delete restrict,
 reviewer_name text, review_note text not null default '', sanction_change numeric not null default 0
);
create unique index rmc_corrections_pending_idx on public.rmc_attendance_corrections(student_id,event_id,slot) where status='pending';
create index rmc_corrections_student_idx on public.rmc_attendance_corrections(student_id,created_at desc,id);
create index rmc_corrections_event_idx on public.rmc_attendance_corrections(event_id);
create index rmc_corrections_reviewer_idx on public.rmc_attendance_corrections(reviewer_id);
create index rmc_corrections_status_idx on public.rmc_attendance_corrections(status,created_at desc,id);
alter table public.rmc_attendance_corrections enable row level security;
revoke all on public.rmc_attendance_corrections from public,anon,authenticated;
grant select on public.rmc_attendance_corrections to authenticated;
grant all on public.rmc_attendance_corrections to service_role;

create function app_private.correction_reviewer(student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.actor() a join public.rmc_profiles p on p.id=student
 where a.role_id in ('admin','ossa','ossa_staff') and app_private.permitted('ossa.manage_cases')
 and app_private.in_scope(p.node_id) and not app_private.access_frozen())
$$;
revoke all on function app_private.correction_reviewer(uuid) from public,anon;
grant execute on function app_private.correction_reviewer(uuid) to authenticated;
create policy correction_read on public.rmc_attendance_corrections for select to authenticated using (
 not (select app_private.access_frozen()) and (select app_private.session_allowed())
 and (student_id=(select auth.uid()) or app_private.correction_reviewer(student_id))
);

-- A restrictive policy narrows the existing general document policy for this folder.
create policy correction_document_read on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'rmc-documents' or (storage.foldername(name))[2]<>'corrections'
 or (storage.foldername(name))[1]=(select auth.uid())::text
 or exists(select 1 from public.rmc_attendance_corrections c where c.proof_url='storage://' || name
   and app_private.correction_reviewer(c.student_id))
);
-- Preserve submitted evidence; unused failed-submission uploads can still be removed.
create function app_private.correction_evidence_used(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rmc_attendance_corrections where proof_url='storage://' || object_name)
$$;
revoke all on function app_private.correction_evidence_used(text) from public,anon;
grant execute on function app_private.correction_evidence_used(text) to authenticated;
create policy correction_document_delete on storage.objects as restrictive for delete to authenticated using (
 bucket_id<>'rmc-documents' or (storage.foldername(name))[2]<>'corrections'
 or not app_private.correction_evidence_used(name)
);

-- Use the same Manila session IDs and class window overrides as the scanner.
create function app_private.correction_sessions(ev public.rmc_events, person jsonb)
returns table(slot text, starts_at timestamptz, ends_at timestamptz, late_at timestamptz, label text)
language plpgsql stable security invoker set search_path='' as $$
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
end $$;
revoke all on function app_private.correction_sessions(public.rmc_events,jsonb) from public,anon,authenticated;

create function app_private.correction_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); result jsonb;
begin
 if a.id is null or a.role_id not in ('student','mayor','ssg') or app_private.access_frozen() then
  raise exception 'An active student account is required.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('event_id',e.id,'event_title',e.data->>'title','slot',s.slot,
 'label',s.label,'starts_at',s.starts_at,'ends_at',s.ends_at,'late_at',s.late_at,'original',att.data)
 order by s.starts_at desc,e.id,s.slot),'[]') into result
 from public.rmc_events e cross join lateral app_private.correction_sessions(e,a.profile) s
 left join public.rmc_attendance att on att.event_id=e.id and att.student_id=a.id and att.slot=s.slot
 where e.end_at<now() and e.end_at>=now()-interval '30 days' and a.created_at<=e.start_at
 and coalesce(e.data->>'kind','attendance') in ('attendance','flag_ceremony')
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

create function app_private.submit_attendance_correction(target_event uuid,target_slot text,explanation text,
 claimed_in timestamptz,claimed_out timestamptz,evidence text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); e public.rmc_events; option jsonb; request_id uuid; proof text:=nullif(evidence,'');
begin
 -- Event then student lock ordering matches attendance and finalization.
 select * into strict e from public.rmc_events where id=target_event for share;
 perform 1 from public.rmc_profiles where id=a.id for update;
 select value into option from jsonb_array_elements(app_private.correction_options())
 where value->>'event_id'=target_event::text and value->>'slot'=target_slot;
 if option is null then raise exception 'This session is unavailable or already has a pending correction. Refresh or contact OSSA.'; end if;
 if coalesce(length(trim(explanation)),0) not between 10 and 2000 then raise exception 'Enter an explanation between 10 and 2000 characters.'; end if;
 if claimed_in is not null and (not isfinite(claimed_in) or claimed_in<(option->>'starts_at')::timestamptz or claimed_in>(option->>'ends_at')::timestamptz) then raise exception 'Time-in must be within the selected session.'; end if;
 if claimed_out is not null and (claimed_in is null or not isfinite(claimed_out) or claimed_out<claimed_in or claimed_out>(option->>'ends_at')::timestamptz) then raise exception 'Time-out must follow time-in within the selected session.'; end if;
 if proof is not null and (proof not like 'storage://' || a.id::text || '/corrections/%'
 or not exists(select 1 from storage.objects where bucket_id='rmc-documents' and name=substr(proof,11)
 and metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png','image/webp')
 and (metadata->>'size')::bigint between 1 and 5242880)) then raise exception 'Upload valid supporting evidence to your account first.'; end if;
 insert into public.rmc_attendance_corrections(student_id,event_id,slot,session_starts_at,session_ends_at,session_late_at,student_name,student_number,event_title,reason,
 proposed_time_in,proposed_time_out,proof_url,original)
 values(a.id,e.id,target_slot,(option->>'starts_at')::timestamptz,(option->>'ends_at')::timestamptz,(option->>'late_at')::timestamptz,
 a.profile->>'name',a.profile->>'student_id',e.data->>'title',trim(explanation),claimed_in,claimed_out,proof,nullif(option->'original','null'::jsonb)) returning id into request_id;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.correction.submit',a.id::text,
 jsonb_build_object('request_id',request_id,'event_id',e.id,'slot',target_slot,'actor_name',a.profile->>'name','target_name',a.profile->>'name'));
 return request_id;
end $$;

create function app_private.review_attendance_correction(request_id uuid,decision text,note text,
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
  after_record:=(coalesce(before_record,'{}')-'time_in'-'time_out')||jsonb_build_object('status',new_status,'slot',c.slot,
    'method','correction','correction_id',c.id,'corrected_by_uid',a.id,'corrected_by_name',a.profile->>'name',
    'corrected_at',extract(epoch from now())*1000,'correction_note',trim(note));
  if verified_in is not null then after_record:=after_record||jsonb_build_object('time_in',extract(epoch from verified_in)*1000); end if;
  if verified_out is not null then after_record:=after_record||jsonb_build_object('time_out',extract(epoch from verified_out)*1000); end if;
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

create function app_private.notify_attendance_correction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 values(new.student_id,'attendance-correction:'||new.id||':'||new.status,'Attendance correction: '||new.status,
 new.event_title||' / '||new.slot||' - '||case when new.status='pending' then 'Submitted for OSSA review.' else new.review_note end,'/student/records')
 on conflict(user_id,source) do nothing;
 return new;
end $$;
create trigger notify_attendance_correction after insert or update of status on public.rmc_attendance_corrections
 for each row execute function app_private.notify_attendance_correction();
revoke all on function app_private.notify_attendance_correction() from public,anon,authenticated;

create function public.rmc_correction_options() returns jsonb language sql security invoker set search_path='' as $$ select app_private.correction_options() $$;
create function public.rmc_submit_attendance_correction(target_event uuid,target_slot text,explanation text,
 claimed_in timestamptz default null,claimed_out timestamptz default null,evidence text default null)
 returns uuid language sql security invoker set search_path='' as $$ select app_private.submit_attendance_correction(target_event,target_slot,explanation,claimed_in,claimed_out,evidence) $$;
create function public.rmc_review_attendance_correction(request_id uuid,decision text,note text,
 verified_in timestamptz default null,verified_out timestamptz default null)
 returns void language sql security invoker set search_path='' as $$ select app_private.review_attendance_correction(request_id,decision,note,verified_in,verified_out) $$;
revoke all on function app_private.correction_options(),public.rmc_correction_options(),
 app_private.submit_attendance_correction(uuid,text,text,timestamptz,timestamptz,text),public.rmc_submit_attendance_correction(uuid,text,text,timestamptz,timestamptz,text),
 app_private.review_attendance_correction(uuid,text,text,timestamptz,timestamptz),public.rmc_review_attendance_correction(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function app_private.correction_options(),public.rmc_correction_options(),
 app_private.submit_attendance_correction(uuid,text,text,timestamptz,timestamptz,text),public.rmc_submit_attendance_correction(uuid,text,text,timestamptz,timestamptz,text),
 app_private.review_attendance_correction(uuid,text,text,timestamptz,timestamptz),public.rmc_review_attendance_correction(uuid,text,text,timestamptz,timestamptz) to authenticated;
commit;
