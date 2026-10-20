-- Run after the migration inside BEGIN/ROLLBACK against a linked test database.
-- All fixtures and writes are rolled back by the caller.
do $$
declare actor uuid; session_id uuid; suffix text:=replace(gen_random_uuid()::text,'-','');
 root text:='review_root_'||suffix; child text:='review_child_'||suffix;
 dest text:='review_dest_'||suffix; class_dest text:='review_class_dest_'||suffix;
 person uuid:=gen_random_uuid(); disposable uuid:=gen_random_uuid(); org uuid:=gen_random_uuid();
 event_id uuid:=gen_random_uuid(); calendar_id uuid:=gen_random_uuid(); closure_id uuid:=gen_random_uuid(); clearance_id uuid:=gen_random_uuid();
 preview jsonb; plan jsonb; keep_plan jsonb; confirmation jsonb; rejected boolean; result jsonb; fixture_profile jsonb;
begin
 select p.id,s.id into strict actor,session_id from public.rmc_profiles p join auth.sessions s on s.user_id=p.id
 where p.role_id='admin' and p.status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',session_id,
 'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())),jsonb_build_object('method','totp','timestamp',extract(epoch from now()))))::text,true);
 insert into public.rmc_nodes(id,parent_id,data) values
 (root,null,jsonb_build_object('id',root,'name','Review source','type','campus')),
 (child,root,jsonb_build_object('id',child,'name','Review class','type','section')),
 (dest,null,jsonb_build_object('id',dest,'name','Review destination','type','campus')),
 (class_dest,dest,jsonb_build_object('id',class_dest,'name','Review destination class','type','block'));
 insert into public.rmc_organizations(id,node_id,name) values(org,root,'Review organization');
 -- Provisioned fixture signup creates a profile and enrollment application.
 insert into app_private.provision_reservations(email,created_at) values('review-'||suffix||'@example.invalid',now()),('discard-'||suffix||'@example.invalid',now());
 fixture_profile:=jsonb_build_object('name','Review student '||suffix,'username','review_'||suffix,'student_id','REVIEW-'||suffix,
 'school_data',jsonb_build_object('academic_assignment',jsonb_build_object('terminalGroupId',child)));
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(person,'review-'||suffix||'@example.invalid',jsonb_build_object('profile',fixture_profile),'{}');
 fixture_profile:=fixture_profile||jsonb_build_object('name','Discard student '||suffix,'username','discard_'||suffix,'student_id','DISCARD-'||suffix);
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(disposable,'discard-'||suffix||'@example.invalid',jsonb_build_object('profile',fixture_profile),'{}');
 update public.rmc_profiles set status='active',role_id='mayor',profile=profile||'{"role":"mayor","account_status":"active"}' where id=person;
 insert into public.rmc_events(id,node_id,created_by,start_at,end_at,data) values(event_id,root,actor,now(),now()+interval '1 hour',
  jsonb_build_object('title','Review event','status','upcoming','startTime',extract(epoch from now())*1000,'endTime',extract(epoch from now()+interval '1 hour')*1000,
   'penaltyValue',0,'penaltyUnit','hours','geofenceEnabled',false,'scopeNodeId',root,'audienceTarget',jsonb_build_object('nodeId',child,'groups',jsonb_build_array('node:'||child))));
 insert into public.rmc_attendance(event_id,student_id,data) values(event_id,person,'{"status":"present"}');
 insert into public.rmc_calendar_schedules(id,title,starts_at,ends_at,scope_node_id,recipients,created_by)
  values(calendar_id,'Review calendar',now(),now()+interval '1 hour',root,array['node:'||child],actor);
 insert into public.rmc_calendar_closures(id,title,reason,kind,starts_on,ends_on,node_ids,created_by)
  values(closure_id,'Review closure','Regression fixture','holiday',current_date,current_date,array[root,child],actor);
 insert into app_private.clearance_schedules(id,title,node_id,starts_at,ends_at,created_by)
  values(clearance_id,'Review clearance',child,now(),now()+interval '1 hour',actor);
 preview:=public.rmc_preview_unit_deletion(root);
 if jsonb_array_length(preview->'records')<>9 then raise exception 'FAIL: inventory omits records: %',preview; end if;
 if exists(select 1 from jsonb_array_elements(preview->'records') r where r->>'key' in ('event:'||event_id,'account:'||person) and (r->>'canDelete')::boolean) then raise exception 'FAIL: history protection missing'; end if;
 confirmation:=jsonb_build_object('typedAction','DELETE','typedName','Review source','reason','Regression fixture cleanup');
 plan:=jsonb_build_object('version',preview->>'version','deleteKeys',jsonb_build_array('unit:'||root,'unit:'||child,'account:'||disposable),
 'transfers',jsonb_build_object('account:'||person,class_dest,'organization:'||org,dest,'event:'||event_id,dest,'calendar:'||calendar_id,dest,'closure:'||closure_id,dest,'clearance:'||clearance_id,dest));
 -- Missing destination, forged selection and stale inventory must fail atomically.
 rejected:=false;
 begin perform public.rmc_delete_unit_reviewed(root,confirmation,jsonb_set(plan,'{transfers}','{}')); exception when others then rejected:=true; end;
 if not rejected or not exists(select 1 from public.rmc_nodes where id=root) then raise exception 'FAIL: missing transfer changed data'; end if;
 rejected:=false;
 begin perform public.rmc_delete_unit_reviewed(root,confirmation,jsonb_set(plan,'{deleteKeys}',(plan->'deleteKeys')||'"account:forged"')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: forged selection accepted'; end if;
 rejected:=false;
 begin perform public.rmc_delete_unit_reviewed(root,confirmation,jsonb_set(plan,'{deleteKeys}',(plan->'deleteKeys')||to_jsonb('event:'||event_id))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: protected event deletion accepted'; end if;
 update public.rmc_organizations set name='Review organization updated' where id=org;
 rejected:=false;
 begin perform public.rmc_delete_unit_reviewed(root,confirmation,plan); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: stale inventory accepted'; end if;
 preview:=public.rmc_preview_unit_deletion(root);
 plan:=jsonb_set(plan,'{version}',preview->'version');
 -- Fresh password is enforced independently of frontend validation.
 perform set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||'{"amr":[]}'::jsonb)::text,true);
 rejected:=false;
 begin perform public.rmc_preview_unit_deletion(root); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: preview allowed without fresh verification'; end if;
 rejected:=false;
 begin perform public.rmc_delete_unit_reviewed(root,confirmation,plan); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: missing reauthentication accepted'; end if;
 perform set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||jsonb_build_object('amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from now())),jsonb_build_object('method','totp','timestamp',extract(epoch from now())))))::text,true);
 -- Retaining a class transfers the class as a whole. Its students and applications
 -- stay in that class, with canonical paths rebuilt under the new campus.
 begin
  keep_plan:=jsonb_set(plan,'{deleteKeys}',jsonb_build_array('unit:'||root,'account:'||disposable));
  keep_plan:=jsonb_set(keep_plan,'{transfers}',keep_plan->'transfers'||jsonb_build_object('unit:'||child,dest));
  perform public.rmc_delete_unit_reviewed(root,confirmation,keep_plan);
  if not exists(select 1 from public.rmc_nodes where id=child and parent_id=dest) then raise exception 'FAIL: retained class was not reparented'; end if;
  if not exists(select 1 from public.rmc_profiles where id=person and node_id=child and role_id='mayor'
   and profile#>'{school_data,academic_assignment,nodePathIds}'=jsonb_build_array(dest,child)) then raise exception 'FAIL: retained class member path or role incorrect'; end if;
  if not exists(select 1 from public.rmc_applications where id=person and enrollment_node_id=child
   and data#>'{form_data,school_data,academic_assignment,nodePathIds}'=jsonb_build_array(dest,child)) then raise exception 'FAIL: retained class application path incorrect'; end if;
  raise exception 'rollback retained-class test' using errcode='P1234';
 exception when sqlstate 'P1234' then null;
 end;
 result:=public.rmc_delete_unit_reviewed(root,confirmation,plan);
 if exists(select 1 from public.rmc_nodes where id in(root,child)) then raise exception 'FAIL: units remain'; end if;
 if exists(select 1 from auth.users where id=disposable) or exists(select 1 from public.rmc_applications where id=disposable) then raise exception 'FAIL: selected account or application remains'; end if;
 if not exists(select 1 from public.rmc_profiles where id=person and node_id=class_dest and role_id='student'
 and profile#>>'{school_data,academic_assignment,terminalGroupId}'=class_dest) then raise exception 'FAIL: retained account assignment or mayor role incorrect'; end if;
 if not exists(select 1 from public.rmc_applications where id=person and enrollment_node_id=class_dest) then raise exception 'FAIL: application was not transferred'; end if;
 if not exists(select 1 from public.rmc_organizations where id=org and node_id=dest) then raise exception 'FAIL: organization was not transferred'; end if;
 if not exists(select 1 from public.rmc_attendance where student_id=person) then raise exception 'FAIL: attendance history lost'; end if;
 if not exists(select 1 from public.rmc_events where id=event_id and node_id=dest and data#>>'{audienceTarget,nodeId}'=dest and data#>'{audienceTarget,groups}'=jsonb_build_array('node:'||dest)) then raise exception 'FAIL: event audience not transferred'; end if;
 if not exists(select 1 from public.rmc_calendar_schedules where id=calendar_id and scope_node_id=dest and recipients=array['node:'||dest]) then raise exception 'FAIL: calendar not transferred'; end if;
 if not exists(select 1 from public.rmc_calendar_closures where id=closure_id and node_ids=array[dest]) then raise exception 'FAIL: closure not transferred'; end if;
 if not exists(select 1 from app_private.clearance_schedules where id=clearance_id and node_id=dest) then raise exception 'FAIL: clearance not transferred'; end if;
 raise notice 'PASS: inventory, missing destination, forged selection, stale review, reauthentication, selective deletion and retained account/application/organization transfer';
end $$;
