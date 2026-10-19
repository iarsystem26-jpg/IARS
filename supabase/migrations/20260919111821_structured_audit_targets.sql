create or replace function app_private.command(action text, args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 a public.rmc_profiles:=app_private.actor(); p public.rmc_profiles; e public.rmc_events;
 target text:=args->>0; n text; d jsonb; old jsonb; item jsonb; result jsonb:='true';
 rid uuid; i integer; count integer; role text; delta numeric; t numeric:=extract(epoch from clock_timestamp())*1000;
begin
 if a.id is null then raise exception 'An active authenticated account is required.' using errcode='42501'; end if;
 case
 when action in ('addSchoolNode','updateSchoolNode','archiveSchoolNode','deleteSchoolNode','replaceSchoolStructure') then
  perform pg_advisory_xact_lock(hashtext('rmc-directory'));
  n:=case when action='addSchoolNode' then nullif(target,'') else target end;
  perform app_private.assert_permission(case when action='deleteSchoolNode' then 'directory.delete_structure' else 'directory.manage_structure' end,n);
  if action='replaceSchoolStructure' then raise exception 'Edit units individually to preserve references.'; end if;
  if action='addSchoolNode' then
   if n is null and a.role_id<>'admin' then raise exception 'Only the administrator can create campuses.'; end if;
   perform app_private.write_node(n,args->1);
  elsif action='updateSchoolNode' then
   update public.rmc_nodes set data=data||jsonb_build_object('name',coalesce(args#>>'{1,name}',data->>'name'),'type',coalesce(args#>>'{1,type}',data->>'type'),'metadata',coalesce(data->'metadata','{}')||coalesce(args#>'{1,metadata}','{}')) where id=target;
   if not found then raise exception 'Unit not found.'; end if;
  elsif action='archiveSchoolNode' then
   update public.rmc_nodes set data=jsonb_set(data,'{metadata}',coalesce(data->'metadata','{}')||'{"archived":true}') where id=target;
  else
   if exists(select 1 from public.rmc_nodes where parent_id=target) or exists(select 1 from public.rmc_profiles where node_id=target)
    or exists(select 1 from public.rmc_events where node_id=target or data#>>'{audienceTarget,nodeId}'=target or data#>'{audienceTarget,groups}' ? ('node:'||target)) then return 'false'; end if;
   delete from public.rmc_nodes where id=target; result:=to_jsonb(found);
  end if;
 when action='setSectionSecurityKey' then
  perform app_private.assert_permission('directory.manage_members',target);
  if length(trim(args->>1))<8 then raise exception 'Use an enrollment key of at least 8 characters.'; end if;
  update public.rmc_nodes set enrollment_key_hash=extensions.crypt(upper(trim(args->>1)),extensions.gen_salt('bf')),data=data||'{"enrollmentKeyRequired":true}' where id=target;
  if not found then raise exception 'Section not found.'; end if;
 when action in ('updateContactDetails','updatePhoto') then
  if target::uuid<>a.id then perform app_private.assert_permission('directory.manage_members',(select node_id from public.rmc_profiles where id=target::uuid)); end if;
  if app_private.frozen(a.node_id) and a.role_id<>'admin' then raise exception 'Profile updates are frozen.'; end if;
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  d:=args->1; old:=p.profile;
  if action='updatePhoto' then
   if d->>'path' not like 'storage://' || p.id::text || '/%' or not exists(select 1 from storage.objects where bucket_id='rmc-documents' and name=substring(d->>'path' from 11) and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')) then raise exception 'Upload a valid profile photo first.'; end if;
   old:=old||jsonb_build_object('photo_url',d->>'path');
  end if;
  if d ? 'phone' then old:=jsonb_set(old,'{phone}',to_jsonb(trim(d->>'phone'))); end if;
  if d ? 'guardianName' or d ? 'guardianContact' then
   old:=jsonb_set(old,'{guardian}',coalesce(nullif(old->'guardian','null'),'{}')||jsonb_strip_nulls(jsonb_build_object('name',d->>'guardianName','contact',d->>'guardianContact')));
  end if;
  update public.rmc_profiles set profile=old where id=p.id;
 when action in ('approveApplication','rejectApplication') then
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  perform app_private.assert_permission('directory.manage_members',p.node_id);
  select data into strict d from public.rmc_applications where id=p.id for update;
  if d->>'status'<>'pending' then raise exception 'This application has already been reviewed.'; end if;
  if action='approveApplication' then
   role:=coalesce(args->>1,'student');
   if role not in ('student','mayor') then raise exception 'Admissions may only approve student accounts.'; end if;
   if role='mayor' then perform pg_advisory_xact_lock(hashtext('mayor:'||p.node_id));
    if exists(select 1 from public.rmc_profiles where role_id='mayor' and node_id=p.node_id and status='active') then raise exception 'This section already has a mayor.'; end if;
   end if;
   old:=p.profile||jsonb_build_object('role',role,'account_status','active','photo_url',coalesce(d#>>'{documents,photo}',p.profile->>'photo_url',''));
   if role='mayor' then old:=app_private.assign_profile(old,p.node_id,true); end if;
   update public.rmc_profiles set role_id=role,status='active',profile=old where id=p.id;
   update public.rmc_applications set data=data||jsonb_build_object('status','approved','reviewed_at',t,'reviewed_by',a.id,'form_data',old) where id=p.id;
  else
   if length(trim(args->>1))<3 then raise exception 'Provide a rejection reason.'; end if;
   update public.rmc_applications set data=data||jsonb_build_object('status','rejected','rejection_reason',args->>1,'rejection_count',coalesce((data->>'rejection_count')::int,0)+1,'reviewed_at',t,'reviewed_by',a.id) where id=p.id;
  end if;
 when action in ('assignSectionMayor','assignRole','assignAccountRole','assignOfficialToNode') then
  if action in ('assignAccountRole','assignOfficialToNode') then target:=args->>1; end if;
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  if p.role_id='admin' then raise exception 'System owner accounts cannot be reassigned.'; end if;
  if action='assignSectionMayor' then
   n:=args->>1; perform app_private.assert_permission('directory.manage_members',n);
   if p.node_id<>n or p.role_id not in ('student','mayor') then raise exception 'Choose a student in this section.'; end if;
   perform pg_advisory_xact_lock(hashtext('mayor:'||n));
   update public.rmc_profiles set role_id='student',profile=profile||'{"role":"student"}' where node_id=n and role_id='mayor';
   update public.rmc_profiles set role_id='mayor',profile=app_private.assign_profile(profile||'{"role":"mayor"}',n,true) where id=p.id;
  elsif action='assignOfficialToNode' then
   n:=args->>2; perform app_private.assert_permission('system.manage_accounts',n);
   if not app_private.in_scope(p.node_id) then raise exception 'This account is outside your scope.'; end if;
   update public.rmc_profiles set node_id=n,profile=app_private.assign_profile(profile,n,true) where id=p.id;
  else
   perform app_private.assert_permission('system.manage_rbac',p.node_id);
   role:=case when action='assignAccountRole' then args->>2 else args->>1 end;
   if role='admin' then raise exception 'System owner access cannot be assigned here.'; end if;
   select data into strict d from public.rmc_roles where id=role;
   if d->>'isPositionOnly'='true' then
    update public.rmc_profiles set profile=jsonb_set(profile,'{positionRoleIds}',coalesce(profile->'positionRoleIds','[]')||to_jsonb(role)) where id=p.id;
   else update public.rmc_profiles set role_id=role,profile=profile||jsonb_build_object('role',role) where id=p.id; end if;
  end if;
 when action in ('createEvent','updateEvent','archiveEvent','cancelEvent','deleteEvent') then
  if action='createEvent' then
   d:=args->0; n:=case when a.role_id='admin' then d->>'scopeNodeId' else a.node_id end;
   if a.role_id<>'admin' and n is null then raise exception 'An assigned scope is required.'; end if;
  else
   select * into strict e from public.rmc_events where id=target::uuid for update; n:=e.node_id; d:=e.data;
   if a.role_id<>'admin' and not app_private.in_scope(n) then raise exception 'This event is outside your scope.'; end if;
   if action='updateEvent' then
    if exists(select 1 from public.rmc_attendance where event_id=e.id) then raise exception 'Events with attendance records cannot be edited. Archive or cancel this event.'; end if;
    d:=d||(args->1); end if;
  end if;
  perform app_private.assert_permission('events.manage',n);
  if action in ('createEvent','updateEvent') then
   if coalesce(length(trim(d->>'title')),0)=0 or (d->>'endTime')::numeric <= (d->>'startTime')::numeric then raise exception 'Enter a title and a valid event schedule.'; end if;
   if (d->>'endTime')::numeric-(d->>'startTime')::numeric>366*86400000::numeric then raise exception 'An event may span at most one year.'; end if;
   if d->>'kind'='merit' and coalesce((d->>'meritHours')::numeric,0)<=0 then raise exception 'Merit hours must be positive.'; end if;
   if coalesce((d->>'penaltyValue')::numeric,0)<0 or coalesce((d#>>'{sanctionRules,late,value}')::numeric,0)<0 or coalesce((d#>>'{sanctionRules,absent,value}')::numeric,0)<0 then raise exception 'Sanctions must not be negative.'; end if;
   if coalesce(d->>'geofenceEnabled','true')='true' and (d#>>'{location,lat}' is null or d#>>'{location,lng}' is null or coalesce((d#>>'{location,radius_meters}')::numeric,0)<=0 or abs((d#>>'{location,lat}')::numeric)>90 or abs((d#>>'{location,lng}')::numeric)>180) then raise exception 'Enter a valid geofence.'; end if;
   for item in select jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) loop
    if item->>'timeIn' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'timeOut' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'timeOut'<=item->>'timeIn' or (item->>'lateAfterMinutes')::numeric<0 then raise exception 'Invalid attendance window.'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) w1,jsonb_array_elements(coalesce(d->'attendanceWindows','[]')) w2 where w1->>'id'<>w2->>'id' and w1->>'timeIn'<w2->>'timeOut' and w2->>'timeIn'<w1->>'timeOut') then raise exception 'Attendance windows must not overlap.'; end if;
   count:=case when action='createEvent' then coalesce((d#>>'{recurrence,occurrences}')::int,1) else 1 end;
   if count<1 or count>52 then raise exception 'Choose 1 to 52 weekly occurrences.'; end if;
   rid:=case when action='createEvent' then gen_random_uuid() else e.id end;
   for i in 0..count-1 loop
    old:=d||jsonb_build_object('id',case when i=0 then rid else gen_random_uuid() end,'created_by',case when action='createEvent' then a.id else e.created_by end,'scopeNodeId',n,'timestamp',t,
     'startTime',(d->>'startTime')::numeric+i*604800000::numeric,'endTime',(d->>'endTime')::numeric+i*604800000::numeric,
     'startDate',to_char((to_timestamp((d->>'startTime')::numeric/1000)+i*interval '7 days') at time zone 'Asia/Manila','YYYY-MM-DD'),
     'endDate',to_char((to_timestamp((d->>'endTime')::numeric/1000)+i*interval '7 days') at time zone 'Asia/Manila','YYYY-MM-DD'),'seriesId',case when count>1 then rid else null end);
    if action='createEvent' then insert into public.rmc_events(id,data,created_by,node_id,start_at,end_at) values((old->>'id')::uuid,old,a.id,n,to_timestamp((old->>'startTime')::numeric/1000),to_timestamp((old->>'endTime')::numeric/1000));
    else update public.rmc_events set data=old,start_at=to_timestamp((old->>'startTime')::numeric/1000),end_at=to_timestamp((old->>'endTime')::numeric/1000) where id=rid; end if;
   end loop;
   result:=to_jsonb(rid);
  elsif action='deleteEvent' then
   if exists(select 1 from public.rmc_attendance where event_id=e.id) or exists(select 1 from public.rmc_excuses where event_id=e.id) or exists(select 1 from public.rmc_sanctions where event_id=e.id) then raise exception 'Archive events that have records.'; end if;
   delete from public.rmc_events where id=e.id;
  elsif action='archiveEvent' then
   if e.end_at>now() then raise exception 'Wait for the event to end or cancel it.'; end if;
   update public.rmc_events set data=data||'{"status":"done"}' where id=e.id;
  else
   update public.rmc_events set data=data||'{"status":"done","cancellationStatus":"cancelled"}',finalized_at=now() where id=e.id;
  end if;
 when action in ('adjustSanctionHours','resolveStudentSanctions') then
  select * into strict p from public.rmc_profiles where id=target::uuid for update;
  perform app_private.assert_permission('ossa.manage_cases',p.node_id);
  delta:=case when action='resolveStudentSanctions' then -app_private.balance(p.id) else (args->>1)::numeric end;
  n:=case when action='resolveStudentSanctions' then args->>1 else args->>2 end;
  if coalesce(length(trim(n)),0)<3 then raise exception 'Enter the reason for this adjustment.'; end if;
  perform app_private.sanction(p.id,delta,n);
 when action='submitExcuseApplication' then
  if app_private.frozen(a.node_id) then raise exception 'Excuse submissions are frozen.'; end if;
  d:=args->0; rid:=(d->>'event_id')::uuid;
  select * into strict e from public.rmc_events where id=rid;
  if not app_private.recipient(e.data,a.profile) then raise exception 'Select an event assigned to you.'; end if;
  if coalesce(length(trim(d->>'reason')),0)<10 or d->>'category' not in ('medical','personal','institutional','emergency') then raise exception 'Enter a valid category and at least 10 characters of explanation.'; end if;
  if d->>'proof_url' is not null and d->>'proof_url' not like 'storage://' || a.id::text || '/%' then raise exception 'Invalid attachment owner.'; end if;
  rid:=gen_random_uuid(); d:=d||jsonb_build_object('id',rid,'student_uid',a.id,'student_name',a.profile->>'name','student_id',a.profile->>'student_id','department',a.profile#>>'{school_data,department}','section',a.profile#>>'{school_data,section}','event_title',e.data->>'title','event_date',e.data->>'startDate','status','pending','submission_date',t);
  insert into public.rmc_excuses(id,student_id,event_id,data) values(rid,a.id,e.id,d); result:=d;
 when action='reviewExcuseApplication' then
  select data into strict d from public.rmc_excuses where id=target::uuid for update;
  select * into strict p from public.rmc_profiles where id=(d->>'student_uid')::uuid for update;
  perform app_private.assert_permission('ossa.manage_cases',p.node_id);
  if d->>'status'<>'pending' then raise exception 'This excuse has already been reviewed.'; end if;
  role:=args->>1; delta:=coalesce((args->>3)::numeric,0);
  if role='approved' then update public.rmc_attendance set data=data||'{"status":"excused"}' where student_id=p.id and event_id=(d->>'event_id')::uuid and data->>'status'='absent'; end if;
  if role not in ('approved','rejected') or delta<0 then raise exception 'Invalid review.'; end if;
  if role='approved' and delta>0 then perform app_private.sanction(p.id,-delta,'Approved excuse: '||(args->>2),(d->>'event_id')::uuid,'excuse:'||target); end if;
  update public.rmc_excuses set data=data||jsonb_build_object('status',role,'review_notes',args->>2,'waived_hours',delta,'reviewed_at',t,'reviewed_by',a.profile->>'name') where id=target::uuid;
 when action in ('setSystemFreezeStatus','setNodeFreezeStatus') then
  perform app_private.assert_permission('system.freeze',null,true);
  if action='setSystemFreezeStatus' then
   update public.rmc_settings set data=jsonb_build_object('isFrozen',(args->>0)::boolean,'reason',coalesce(args->>1,''),'frozenAt',t,'frozenBy',a.profile->>'name') where id='system_freeze' returning data into result;
  else
   if not exists(select 1 from public.rmc_nodes where id=target) then raise exception 'Unit not found.'; end if;
   update public.rmc_settings set data=case when (args->>1)::boolean then data||jsonb_build_object(target,jsonb_build_object('isFrozen',true,'reason',coalesce(args->>2,''),'frozenAt',t,'frozenBy',a.profile->>'name')) else data-target end where id='frozen_nodes' returning data into result;
  end if;
 when action in ('createCustomRole','updateCoreRole','updateCustomRole','deleteCustomRole') then
  perform app_private.assert_permission('system.manage_rbac',null,true);
  if target='admin' then raise exception 'The system owner role is protected.'; end if;
  if action='createCustomRole' then
   target:='role_'||gen_random_uuid()::text; d:=(args->0)||jsonb_build_object('id',target,'createdAt',t,'createdBy',a.id,'isBuiltIn',false);
   insert into public.rmc_roles(id,data) values(target,d); result:=d;
  elsif action='deleteCustomRole' then
   if exists(select 1 from public.rmc_roles where id=target and data->>'isBuiltIn'='true') then raise exception 'Built-in roles cannot be removed.'; end if;
   if exists(select 1 from public.rmc_profiles where role_id=target or profile->'positionRoleIds' ? target) then raise exception 'Reassign accounts before deleting this role.'; end if;
   delete from public.rmc_roles where id=target;
  else
   update public.rmc_roles set data=data||(args->1)||jsonb_build_object('id',target,'updatedAt',t,'isBuiltIn',data->'isBuiltIn') where id=target returning data into result;
  end if;
 when action in ('updatePaymentInfo','sendPaymentReminderToOSAS') then
  perform app_private.assert_permission('system.payment_reminders',null,true);
  if action='updatePaymentInfo' then
   if coalesce((args#>>'{0,amountDue}')::numeric,0)<0 then raise exception 'Amount must not be negative.'; end if;
   update public.rmc_settings set data=data||((args->0)-'reminders') where id='payment_info' returning data into result;
  else
   d:=(args->0)||jsonb_build_object('id',gen_random_uuid(),'sentAt',t,'sentBy',a.profile->>'name','recipientRole','OSSA Administrator','status','in_app');
   update public.rmc_settings set data=jsonb_set(data,'{reminders}',jsonb_build_array(d)||coalesce(data->'reminders','[]')) where id='payment_info'; result:=d;
  end if;
 else raise exception 'Unsupported operation: %',action;
 end case;
 -- Store stable entity IDs rather than request JSON or a parent ID.
 case action
 when 'addSchoolNode' then target:=args#>>'{1,id}';
 when 'createEvent' then target:=result#>>'{}';
 when 'submitExcuseApplication' then target:=result->>'id';
 when 'setSystemFreezeStatus' then target:='system_freeze';
 when 'updatePaymentInfo','sendPaymentReminderToOSAS' then target:='payment_info';
 else null;
 end case;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,action,coalesce(target,''),jsonb_build_object('actor_name',a.profile->>'name','target_name',coalesce(
 (select profile->>'name' from public.rmc_profiles where id::text=target),
 (select data->>'name' from public.rmc_nodes where id=target),
 (select data->>'title' from public.rmc_events where id::text=target),
 (select data->>'student_name' from public.rmc_excuses where id::text=target),target,''),'reason',nullif(args#>>'{1,reason}','')));
 return result;
end $$;
