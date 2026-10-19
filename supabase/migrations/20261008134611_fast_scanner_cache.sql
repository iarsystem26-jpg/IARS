-- Authorized minimal scanner identities now include profile photo references.
create or replace function app_private.prepare_offline_attendance(target_event_id uuid) returns jsonb
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
   'photo_url',p.profile->>'photo_url','school_data',jsonb_build_object('type',p.profile#>>'{school_data,type}','level',p.profile#>>'{school_data,level}','section',p.profile#>>'{school_data,section}')) order by p.profile->>'name'),'[]') into roster
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

create index if not exists rmc_profiles_scanner_student_id_idx
 on public.rmc_profiles (lower(btrim(profile->>'student_id')))
 where status='active' and role_id in ('student','mayor','ssg');

-- This private helper returns a table row only after current account/MFA and event/scope checks.
create or replace function app_private.scanner_student(offline_session_id uuid, student_uid uuid)
 returns public.rmc_profiles language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); g app_private.offline_attendance_sessions;
 e public.rmc_events; p public.rmc_profiles; manager boolean;
begin
 if a.id is null then raise exception 'Sign in and complete MFA.' using errcode='42501'; end if;
 select * into g from app_private.offline_attendance_sessions where id=offline_session_id and actor_id=a.id for share;
 if not found or now()>g.capture_until then raise exception 'Offline preparation is unavailable or expired.' using errcode='42501'; end if;
 select * into strict e from public.rmc_events where id=g.event_id for share;
 manager:=e.organization_id is not null and app_private.organization_manager(e.organization_id);
 if not manager then perform app_private.assert_permission('attendance.scan'); end if;
 if app_private.frozen(a.node_id) or app_private.frozen(e.node_id) then raise exception 'Attendance is frozen.' using errcode='42501'; end if;
 if e.data->>'cancellationStatus' is not null or e.data->>'status'='done' or e.data->>'approvalStatus' in ('pending','rejected')
  or app_private.offline_event_fingerprint(e)<>g.event_fingerprint then raise exception 'Event settings changed. Refresh the offline roster.' using errcode='22023'; end if;
 select * into p from public.rmc_profiles where id=student_uid and status='active' and role_id in ('student','mayor','ssg');
 if not found or app_private.frozen(p.node_id) or (not manager and not coalesce(app_private.in_scope(p.node_id),false))
  or (e.node_id is not null and not coalesce(e.node_id=any(app_private.path(p.node_id)),false))
  or not coalesce((app_private.recipient(e.data,p.profile) or app_private.ceremony_volunteer(e.data,p.profile)),false) then
  raise exception 'No eligible student was found in this event scope.' using errcode='42501';
 end if;
 return p;
end $$;
revoke all on function app_private.scanner_student(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.lookup_scanner_student(offline_session_id uuid, lookup_student_id text, qr_token text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); g app_private.offline_attendance_sessions;
 p public.rmc_profiles; student_uid uuid; pass jsonb; student jsonb; hash text;
begin
 if a.id is null then raise exception 'Sign in and complete MFA.' using errcode='42501'; end if;
 select * into g from app_private.offline_attendance_sessions where id=offline_session_id and actor_id=a.id for update;
 if not found then raise exception 'Offline preparation is unavailable.' using errcode='42501'; end if;
 if (qr_token is null)=(lookup_student_id is null) then raise exception 'Provide one QR or exact student ID.' using errcode='22023'; end if;
 if qr_token is not null then
  if qr_token !~ '^RMC1:[0-9a-f]{64}$' then raise exception 'Invalid QR code.' using errcode='22023'; end if;
  hash:=encode(extensions.digest(substring(qr_token from 6),'sha256'),'hex');
  select q.student_id,jsonb_build_object('studentUid',q.student_id,'hash',q.token_hash,'expiresAt',case when q.expires_at is null then null else extract(epoch from q.expires_at)*1000 end)
   into student_uid,pass from app_private.qr_tokens q where q.token_hash=hash and (q.expires_at is null or q.expires_at>now());
  if not found then raise exception 'QR expired or revoked. Ask the student to refresh it.' using errcode='22023'; end if;
 else
  if length(btrim(lookup_student_id)) not between 1 and 128 then raise exception 'Invalid student ID.' using errcode='22023'; end if;
  select id into student_uid from public.rmc_profiles where lower(btrim(profile->>'student_id'))=lower(btrim(lookup_student_id))
    and status='active' and role_id in ('student','mayor','ssg');
  if not found then raise exception 'No eligible student was found in this event scope.' using errcode='42501'; end if;
 end if;
 p:=app_private.scanner_student(offline_session_id,student_uid);
 student:=jsonb_build_object('uid',p.id,'name',p.profile->>'name','student_id',p.profile->>'student_id','role',p.role_id,'account_status',p.status,
  'photo_url',p.profile->>'photo_url','school_data',jsonb_build_object('type',p.profile#>>'{school_data,type}','level',p.profile#>>'{school_data,level}','section',p.profile#>>'{school_data,section}'));
 if jsonb_array_length(g.roster)>=20000 and not exists(select 1 from jsonb_array_elements(g.roster) x where x->>'uid'=p.id::text) then raise exception 'Roster limit reached. Refresh the roster.' using errcode='22023'; end if;
 if pass is not null and jsonb_array_length(g.qr_hashes)>=20000 and not exists(select 1 from jsonb_array_elements(g.qr_hashes) x where x->>'hash'=hash) then raise exception 'QR preparation limit reached.' using errcode='22023'; end if;
 update app_private.offline_attendance_sessions s set
  roster=(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s.roster) x where x->>'uid'<>p.id::text)||jsonb_build_array(student),
  qr_hashes=case when pass is null then s.qr_hashes else (select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s.qr_hashes) x where x->>'hash'<>hash)||jsonb_build_array(pass) end
 where id=g.id;
 return jsonb_build_object('sessionId',g.id,'actorUid',a.id,'student',student,'qrHash',pass);
end $$;
revoke all on function app_private.lookup_scanner_student(uuid,text,text) from public,anon,authenticated;
grant execute on function app_private.lookup_scanner_student(uuid,text,text) to authenticated;
create or replace function public.rmc_lookup_scanner_student(offline_session_id uuid, lookup_student_id text default null, qr_token text default null)
 returns jsonb language sql security invoker set search_path='' as $$
 select app_private.lookup_scanner_student(offline_session_id,lookup_student_id,qr_token)
$$;
revoke all on function public.rmc_lookup_scanner_student(uuid,text,text) from public,anon;
grant execute on function public.rmc_lookup_scanner_student(uuid,text,text) to authenticated;

create or replace function app_private.scanner_photo_source(offline_session_id uuid,student_uid uuid) returns text
 language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles;
begin
 p:=app_private.scanner_student(offline_session_id,student_uid);
 if not exists(select 1 from app_private.offline_attendance_sessions g,jsonb_array_elements(g.roster) x where g.id=offline_session_id and x->>'uid'=student_uid::text) then
  raise exception 'Student is not in the authorized roster.' using errcode='42501';
 end if;
 return p.profile->>'photo_url';
end $$;
revoke all on function app_private.scanner_photo_source(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.scanner_photo_source(uuid,uuid) to authenticated;
create or replace function public.rmc_scanner_photo_source(offline_session_id uuid,student_uid uuid) returns text
 language sql security invoker set search_path='' as $$select app_private.scanner_photo_source(offline_session_id,student_uid)$$;
revoke all on function public.rmc_scanner_photo_source(uuid,uuid) from public,anon;
grant execute on function public.rmc_scanner_photo_source(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
