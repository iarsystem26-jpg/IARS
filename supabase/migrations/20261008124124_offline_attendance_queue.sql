-- Offline submissions use capture time only after the grant, identity, roster, and payload checks below.
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
    where not exists(select 1 from public.rmc_attendance att where att.event_id=e.id and att.student_id=p.id
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

revoke all on function app_private.record_offline_attendance_at(uuid,uuid,text,text,jsonb,text,timestamptz) from public, anon, authenticated;

create table app_private.offline_attendance_sessions (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 actor_id uuid not null references public.rmc_profiles(id) on delete cascade,
 event_id uuid not null references public.rmc_events(id) on delete cascade,
 prepared_at timestamptz not null default now(),
 capture_until timestamptz not null,
 sync_until timestamptz not null,
 event_fingerprint text not null,
 roster jsonb not null check (jsonb_typeof(roster)='array'),
 qr_hashes jsonb not null check (jsonb_typeof(qr_hashes)='array')
);
create index offline_attendance_actor_idx on app_private.offline_attendance_sessions(actor_id);
create index offline_attendance_event_idx on app_private.offline_attendance_sessions(event_id);
create index offline_attendance_expiry_idx on app_private.offline_attendance_sessions(sync_until);
alter table app_private.offline_attendance_sessions enable row level security;
revoke all on app_private.offline_attendance_sessions from public, anon, authenticated;

create table app_private.offline_attendance_receipts (
 request_id uuid primary key,
 session_id uuid not null references app_private.offline_attendance_sessions(id) on delete cascade,
 payload_hash text not null,
 receipt jsonb not null,
 synced_at timestamptz not null default now()
);
create index offline_attendance_receipt_session_idx on app_private.offline_attendance_receipts(session_id);
alter table app_private.offline_attendance_receipts enable row level security;
revoke all on app_private.offline_attendance_receipts from public, anon, authenticated;

create function app_private.offline_event_fingerprint(e public.rmc_events) returns text
 language sql immutable set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('data',e.data-'status','start',e.start_at,'end',e.end_at,'node',e.node_id,'organization',e.organization_id)::text,'sha256'),'hex')
$$;
revoke all on function app_private.offline_event_fingerprint(public.rmc_events) from public, anon, authenticated;

create function app_private.prepare_offline_attendance(target_event_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); e public.rmc_events; roster jsonb; hashes jsonb; grant_row app_private.offline_attendance_sessions; manager boolean;
begin
 if a.id is null then raise exception 'Sign in and complete MFA before preparing offline attendance.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=target_event_id for share;
 manager:=e.organization_id is not null and app_private.organization_manager(e.organization_id);
 if not manager then perform app_private.assert_permission('attendance.scan'); end if;
 if app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is frozen.' using errcode='42501'; end if;
 if e.end_at<now() or e.start_at>now()+interval '24 hours' or e.data->>'status'='done' or e.data->>'cancellationStatus' is not null
    or e.data->>'approvalStatus' in ('pending','rejected') then raise exception 'Prepare an approved ongoing event or one starting within 24 hours.' using errcode='22023'; end if;
 if (select count(*) from app_private.offline_attendance_sessions s where s.actor_id=a.id and s.prepared_at>now()-interval '1 hour')>=30 then
  raise exception 'Too many offline preparations. Use the downloaded roster or try again later.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('uid',p.id,'name',p.profile->>'name','student_id',p.profile->>'student_id','role',p.role_id,'account_status',p.status,
   'school_data',jsonb_build_object('type',p.profile#>>'{school_data,type}','level',p.profile#>>'{school_data,level}','section',p.profile#>>'{school_data,section}')) order by p.profile->>'name'),'[]') into roster
 from public.rmc_profiles p where p.status='active' and p.role_id in ('student','mayor','ssg') and not app_private.frozen(p.node_id)
 and (manager or app_private.in_scope(p.node_id))
 and (e.node_id is null or e.node_id=any(app_private.path(p.node_id)))
 and (app_private.recipient(e.data,p.profile) or app_private.ceremony_volunteer(e.data,p.profile));
 if jsonb_array_length(roster)=0 then raise exception 'No eligible students are available in your event scope.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('studentUid',q.student_id,'hash',q.token_hash,'expiresAt',case when q.expires_at is null then null else extract(epoch from q.expires_at)*1000 end)),'[]') into hashes
 from app_private.qr_tokens q where (q.expires_at is null or q.expires_at>now()) and exists(select 1 from jsonb_array_elements(roster) p where (p->>'uid')::uuid=q.student_id);
 insert into app_private.offline_attendance_sessions(actor_id,event_id,capture_until,sync_until,event_fingerprint,roster,qr_hashes)
 values(a.id,e.id,least(e.end_at,now()+interval '24 hours'),least(e.end_at,now()+interval '24 hours')+interval '72 hours',app_private.offline_event_fingerprint(e),roster,hashes) returning * into grant_row;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.offline_prepare',e.id::text,jsonb_build_object('students',jsonb_array_length(roster),'session',grant_row.id));
 return jsonb_build_object('id',grant_row.id,'actorUid',a.id,'actor',jsonb_build_object('uid',a.id,'name',a.profile->>'name','student_id',a.profile->>'student_id','role',a.role_id,'account_status','active','school_data',a.profile->'school_data'),
 'event',e.data||jsonb_build_object('id',e.id,'startTime',extract(epoch from e.start_at)*1000,'endTime',extract(epoch from e.end_at)*1000),
 'preparedAt',extract(epoch from grant_row.prepared_at)*1000,'captureUntil',extract(epoch from grant_row.capture_until)*1000,'syncUntil',extract(epoch from grant_row.sync_until)*1000,'students',roster,'qrHashes',hashes);
end $$;

create function app_private.authorize_offline_qr(offline_session_id uuid, qr_token text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); g app_private.offline_attendance_sessions; student_profile jsonb; pass jsonb;
begin
 if a.id is null then raise exception 'Sign in and complete MFA.' using errcode='42501'; end if;
 select * into g from app_private.offline_attendance_sessions where id=offline_session_id and actor_id=a.id for update;
 if not found or now()>g.capture_until then raise exception 'Offline preparation is unavailable or expired.' using errcode='42501'; end if;
 student_profile:=app_private.resolve_qr(qr_token);
 if not exists(select 1 from jsonb_array_elements(g.roster) p where p->>'uid'=student_profile->>'uid') then raise exception 'Student is not in this roster.' using errcode='42501'; end if;
 select jsonb_build_object('studentUid',q.student_id,'hash',q.token_hash,'expiresAt',case when q.expires_at is null then null else extract(epoch from q.expires_at)*1000 end) into pass
 from app_private.qr_tokens q where q.token_hash=encode(extensions.digest(substring(qr_token from 6),'sha256'),'hex');
 if pass is null then raise exception 'QR expired. Ask the student to refresh it.' using errcode='22023'; end if;
 if jsonb_array_length(g.qr_hashes)>20000 then raise exception 'Offline QR preparation limit reached. Download a fresh roster.' using errcode='22023'; end if;
 update app_private.offline_attendance_sessions s set qr_hashes=(select coalesce(jsonb_agg(q),'[]') from jsonb_array_elements(s.qr_hashes) q where q->>'hash'<>pass->>'hash')||jsonb_build_array(pass) where s.id=g.id;
 return pass;
end $$;

create function app_private.sync_offline_attendance(submission jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); g app_private.offline_attendance_sessions; e public.rmc_events;
 receipt_row app_private.offline_attendance_receipts; rid uuid; sid uuid; student uuid; captured timestamptz; dir text; token text; reason text; payload_hash text; result jsonb; qr_hash text;
begin
 if a.id is null then raise exception 'Sign in and complete MFA to sync attendance.' using errcode='42501'; end if;
 if submission is null or jsonb_typeof(submission)<>'object' or octet_length(submission::text)>16384 then raise exception 'Invalid offline submission.' using errcode='22023'; end if;
 rid:=(submission->>'id')::uuid; sid:=(submission->>'sessionId')::uuid; student:=(submission->>'studentUid')::uuid;
 if rid is null or sid is null or student is null or jsonb_typeof(submission->'capturedAt')<>'number' then raise exception 'Missing offline submission fields.' using errcode='22023'; end if;
 select * into g from app_private.offline_attendance_sessions where id=sid and actor_id=a.id for share;
 if not found then raise exception 'This offline roster belongs to another account or is unavailable.' using errcode='42501'; end if;
 payload_hash:=encode(extensions.digest(submission::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(rid::text,0));
 select * into receipt_row from app_private.offline_attendance_receipts where request_id=rid;
 if found then
  if receipt_row.session_id<>sid or receipt_row.payload_hash<>payload_hash then raise exception 'Submission identifier was reused with different data.' using errcode='22023'; end if;
  return receipt_row.receipt||jsonb_build_object('replayed',true);
 end if;
 captured:=to_timestamp((submission->>'capturedAt')::double precision/1000);
 dir:=submission->>'direction'; token:=nullif(submission->>'qrToken',''); reason:=trim(coalesce(submission->>'manualReason',''));
 if dir is null or dir not in ('in','out') or captured is null or not isfinite(captured) or captured<g.prepared_at or captured>g.capture_until or captured>now()+interval '30 seconds' or now()>g.sync_until then
  raise exception 'Offline capture time or synchronization deadline is invalid. Review this record.' using errcode='22023';
 end if;
 if not exists(select 1 from jsonb_array_elements(g.roster) p where (p->>'uid')::uuid=student) then raise exception 'Student is not in the prepared roster.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=g.event_id for share;
 if app_private.offline_event_fingerprint(e)<>g.event_fingerprint then raise exception 'Event settings changed after preparation. Review this record.' using errcode='22023'; end if;
 if e.data->>'status'='done' and e.finalized_at is null then raise exception 'This event was closed before automatic finalization. Review this record.' using errcode='22023'; end if;
 if token is not null then
  if token !~ '^RMC1:[0-9a-f]{64}$' then raise exception 'Invalid offline QR.' using errcode='22023'; end if;
  qr_hash:=encode(extensions.digest(substring(token from 6),'sha256'),'hex');
  if not exists(select 1 from jsonb_array_elements(g.qr_hashes) q where q->>'hash'=qr_hash and (q->>'studentUid')::uuid=student and (q->>'expiresAt' is null or captured<to_timestamp((q->>'expiresAt')::double precision/1000))) then
   raise exception 'QR was not prepared or was expired at capture. Review this record.' using errcode='22023';
  end if;
  -- A revoked persistent pass cannot be replayed from an old roster. Expiring passes may have been cleaned up after valid capture.
  if exists(select 1 from jsonb_array_elements(g.qr_hashes) q where q->>'hash'=qr_hash and q->>'expiresAt' is null)
    and not exists(select 1 from app_private.qr_tokens q where q.student_id=student and q.token_hash=qr_hash and q.expires_at is null) then
   raise exception 'Printed QR was replaced. Review this record.' using errcode='22023';
  end if;
 elsif length(reason)<5 or length(reason)>1000 then raise exception 'Provide an identity-check reason for manual attendance.' using errcode='22023'; end if;
 result:=app_private.record_offline_attendance_at(g.event_id,student,dir,token,submission->'position',reason,captured);
 result:=result||jsonb_build_object('offline',true,'request_id',rid,'synced_at',extract(epoch from now())*1000);
 insert into app_private.offline_attendance_receipts(request_id,session_id,payload_hash,receipt) values(rid,sid,payload_hash,result);
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.offline_sync',student::text,
   jsonb_build_object('request_id',rid,'offline_session_id',sid,'event_id',g.event_id,'direction',dir,'captured_at',submission->'capturedAt','synced_at',extract(epoch from now())*1000,'already_recorded',coalesce((result->>'already_recorded')::boolean,false)));
 return result;
end $$;

revoke all on function app_private.prepare_offline_attendance(uuid),app_private.sync_offline_attendance(jsonb),app_private.authorize_offline_qr(uuid,text) from public, anon;
grant execute on function app_private.prepare_offline_attendance(uuid),app_private.sync_offline_attendance(jsonb),app_private.authorize_offline_qr(uuid,text) to authenticated;
create function public.rmc_prepare_offline_attendance(target_event_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.prepare_offline_attendance(target_event_id) $$;
create function public.rmc_sync_offline_attendance(submission jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.sync_offline_attendance(submission) $$;
create function public.rmc_authorize_offline_qr(offline_session_id uuid,qr_token text) returns jsonb language sql security invoker set search_path='' as $$ select app_private.authorize_offline_qr(offline_session_id,qr_token) $$;
revoke all on function public.rmc_prepare_offline_attendance(uuid),public.rmc_sync_offline_attendance(jsonb),public.rmc_authorize_offline_qr(uuid,text) from public, anon;
grant execute on function public.rmc_prepare_offline_attendance(uuid),public.rmc_sync_offline_attendance(jsonb),public.rmc_authorize_offline_qr(uuid,text) to authenticated;
-- Expired download grants/receipts contain roster data; the attendance and audit
-- records remain in the normal school record tables. Keep a seven-day support
-- grace period after the synchronization deadline, then remove only these grants.
select cron.schedule('rmc-offline-attendance-retention','27 2 * * *',
 $$delete from app_private.offline_attendance_sessions where sync_until<now()-interval '7 days'$$);
notify pgrst, 'reload schema';
