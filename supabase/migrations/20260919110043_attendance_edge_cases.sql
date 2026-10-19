-- Validate profile images and apply default attendance late rules consistently.
create or replace function app_private.record_attendance(event_id uuid,student_id uuid,direction text,qr_token text,scan_position jsonb,manual_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events; record jsonb; w jsonb; slot_id text; local_now timestamp:=now() at time zone 'Asia/Manila';
 stamp numeric:=extract(epoch from now())*1000; late_at timestamptz; status text; distance numeric; earned numeric; deducted numeric; delta numeric;
begin
 perform app_private.assert_permission('attendance.scan');
 select * into strict e from public.rmc_events where id=event_id for share;
 select * into strict p from public.rmc_profiles where id=student_id for update;
 perform app_private.assert_permission('attendance.scan',p.node_id);
 if p.status<>'active' or app_private.frozen(p.node_id) then raise exception 'Student is inactive or attendance is frozen.'; end if;
 if qr_token is not null then
  if (app_private.resolve_qr(qr_token)->>'uid')::uuid<>p.id then raise exception 'QR does not match this student.'; end if;
 elsif coalesce(length(trim(manual_reason)),0)<5 then raise exception 'Provide a reason for manual attendance entry.'; end if;
 if not app_private.recipient(e.data,p.profile) then raise exception 'Student is not a recipient of this event.'; end if;
 if e.data->>'cancellationStatus' is not null or e.data->>'status'='done' or now()<e.start_at or now()>e.end_at then raise exception 'Scanning is only available during the scheduled event.'; end if;
 if coalesce(e.data->>'geofenceEnabled','true')='true' then
  if scan_position is null or coalesce((scan_position->>'accuracy')::numeric,99999)>100 or (scan_position->>'accuracy')::numeric<0
   or abs(stamp-coalesce((scan_position->>'timestamp')::numeric,0))>60000 or abs((scan_position->>'latitude')::numeric)>90 or abs((scan_position->>'longitude')::numeric)>180
   or scan_position->>'latitude' is null or scan_position->>'longitude' is null then raise exception 'A fresh, accurate GPS location is required.'; end if;
  distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((scan_position->>'latitude')::numeric-(e.data#>>'{location,lat}')::numeric)/2),2)+cos(radians((e.data#>>'{location,lat}')::numeric))*cos(radians((scan_position->>'latitude')::numeric))*power(sin(radians((scan_position->>'longitude')::numeric-(e.data#>>'{location,lng}')::numeric)/2),2))));
  if distance>(e.data#>>'{location,radius_meters}')::numeric then raise exception 'Scanner is outside the event geofence.'; end if;
 end if;
 if jsonb_array_length(coalesce(e.data->'attendanceWindows','[]'))>0 then
  select value into w from jsonb_array_elements(e.data->'attendanceWindows') where local_now::time between (value->>'timeIn')::time and (value->>'timeOut')::time limit 1;
  if w is null then raise exception 'No attendance window is open.'; end if;
  slot_id:=local_now::date::text||':'||(w->>'id');
  late_at:=((local_now::date+(w->>'timeIn')::time) at time zone 'Asia/Manila')+make_interval(mins=>(w->>'lateAfterMinutes')::int);
 else slot_id:='default'; late_at:=e.start_at+interval '15 minutes'; end if;
 select data into record from public.rmc_attendance atn where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id for update;
 if direction='in' then
  if record is not null then return record||'{"already_recorded":true}'; end if;
  status:=case when now()>late_at then 'late' else 'present' end;
  record:=jsonb_build_object('time_in',stamp,'status',status,'slot',slot_id,'scanned_by_uid',a.id,'scanned_by_name',a.profile->>'name','method',case when qr_token is null then 'manual' else 'qr' end,'manual_reason',manual_reason);
  insert into public.rmc_attendance values(e.id,p.id,slot_id,record);
  if status='late' and coalesce(e.data->>'kind','attendance') not in ('service','merit') then
   delta:=coalesce((e.data#>>'{sanctionRules,late,value}')::numeric,0)/case when e.data#>>'{sanctionRules,late,unit}'='minutes' then 60 else 1 end;
   if delta>0 then perform app_private.sanction(p.id,delta,'Late: '||(e.data->>'title'),e.id,'late:'||e.id::text||':'||p.id::text||':'||slot_id); end if;
  end if;
 elsif direction='out' then
  if record is null then raise exception 'Scan in before scanning out.'; end if;
  if record->>'time_out' is not null then return record||'{"already_recorded":true}'; end if;
  earned:=case e.data->>'kind' when 'service' then greatest(0,(stamp-(record->>'time_in')::numeric)/3600000) when 'merit' then coalesce((e.data->>'meritHours')::numeric,0) else 0 end;
  if e.data->>'kind'='merit' and exists(select 1 from public.rmc_sanctions where source='merit:'||e.id::text||':'||p.id::text) then earned:=0; end if;
  deducted:=least(app_private.balance(p.id),earned);
  if earned>0 then perform app_private.sanction(p.id,-deducted,'Service / merit: '||(e.data->>'title'),e.id,case when e.data->>'kind'='merit' then 'merit:'||e.id::text||':'||p.id::text else 'service:'||e.id::text||':'||p.id::text||':'||slot_id end); end if;
  record:=record||jsonb_build_object('time_out',stamp,'rendered_hours',greatest(0,(stamp-(record->>'time_in')::numeric)/3600000),'deducted_hours',deducted);
  update public.rmc_attendance atn set data=record where atn.event_id=e.id and atn.student_id=p.id and slot=slot_id;
 else raise exception 'Invalid attendance direction.'; end if;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'attendance.'||direction,p.id::text,jsonb_build_object('actor_name',a.profile->>'name','target_name',p.profile->>'name','event_id',e.id,'slot',slot_id));
 return record||'{"already_recorded":false}';
end $$;

create or replace function app_private.admission_update(documents jsonb, person jsonb default null, enrollment_key text default null) returns void language plpgsql security definer set search_path='' as $$
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
  if key='photo' and lower(value) !~ '\.(jpeg|jpg|png|webp)$' then raise exception 'Choose an image for the profile photo.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='rmc-documents' and name=substring(value from 11)) then raise exception 'Upload the document first.'; end if;
 end loop;
 update public.rmc_applications set data=d||jsonb_build_object('documents',coalesce(d->'documents','{}')||documents) where id=p.id;
end $$;
