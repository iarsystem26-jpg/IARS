-- Real RBAC grants/revocations and scope boundaries; all fixture changes roll back.
begin;
do $$
declare person uuid; admin_id uuid; actor_id uuid; r text; scope text:='rbac-calendar-'||gen_random_uuid(); outside text:=scope||'-outside';
 custom_id text:=scope||'-delegate'; event_id uuid:=gen_random_uuid(); foreign_event uuid:=gen_random_uuid(); day date:=(now() at time zone 'Asia/Manila')::date+2; result jsonb; cid uuid;
begin
 select id into strict person from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 result:=public.rmc_update_core_role('ossa_staff',jsonb_build_object('permissions',(select data->'permissions' from public.rmc_roles where id='ossa_staff')||'["calendar.manage_closures"]'));
 if not (result->'permissions' ? 'calendar.manage_closures') then raise exception 'Role editor RPC failed to save calendar permission'; end if;
 insert into public.rmc_nodes(id,data) values(scope,'{"name":"RBAC test section","type":"section"}'),(outside,'{"name":"Outside test section","type":"section"}');
 for r in select unnest(array['student','mayor','ssg','ossa','ossa_staff','admin']) loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
  update public.rmc_profiles set role_id=r,profile=jsonb_set(profile,'{role}',to_jsonb(r)) where id=person;
  actor_id:=person;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform public.rmc_personal_calendar(day,day);
 end loop;
 insert into public.rmc_roles(id,data) values(custom_id,jsonb_build_object('id',custom_id,'name','Calendar delegate','isPositionOnly',false,'permissions',jsonb_build_array('calendar.view','calendar.view_scope','calendar.manage_closures')));
 update public.rmc_profiles set role_id=custom_id,node_id=scope,profile=app_private.assign_profile(jsonb_set(profile,'{role}',to_jsonb(custom_id)),scope) where id=person;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_events(id,node_id,created_by,start_at,end_at,data) values
 (event_id,scope,admin_id,(day+time '08:00') at time zone 'Asia/Manila',(day+time '09:00') at time zone 'Asia/Manila',jsonb_build_object('title','Scoped schedule','kind','attendance','status','upcoming','geofenceEnabled',false,'startTime',extract(epoch from (day+time '08:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+time '09:00') at time zone 'Asia/Manila')*1000,'penaltyValue',0,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(admin_id::text)))),
 (foreign_event,outside,admin_id,(day+time '08:00') at time zone 'Asia/Manila',(day+time '09:00') at time zone 'Asia/Manila',jsonb_build_object('title','Outside schedule','kind','attendance','status','upcoming','geofenceEnabled',false,'startTime',extract(epoch from (day+time '08:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+time '09:00') at time zone 'Asia/Manila')*1000,'penaltyValue',0,'penaltyUnit','hours','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(admin_id::text))));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',person::text,true);
 execute 'set local role authenticated';
 result:=public.rmc_personal_calendar(day,day);
 if not exists(select 1 from jsonb_array_elements(result->'items') x where x->>'event_id'=event_id::text) or exists(select 1 from jsonb_array_elements(result->'items') x where x->>'event_id'=foreign_event::text) then raise exception 'Scoped calendar leaks or hides schedules'; end if;
 begin perform public.rmc_preview_closure(day,day,'{}'); raise exception 'School-wide preview permitted'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_preview_closure_schedule(day,day,'{}'); raise exception 'School-wide date preview permitted'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_preview_closure(day,day,array[outside]); raise exception 'Outside scope permitted'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_preview_closure_schedule(day,day,array[outside]); raise exception 'Outside scope date preview permitted'; exception when insufficient_privilege then null; end;
 result:=public.rmc_preview_closure(day,day,array[scope]);
 cid:=public.rmc_apply_closure(day,day,array[scope],'Scoped closure','Official test reason','suspension','suspend','{}',0,result->>'token');
 perform public.rmc_calendar_closures();
 execute 'reset role';
 update public.rmc_roles set data=jsonb_set(data,'{permissions}','[]') where id=custom_id;
 execute 'set local role authenticated';
 begin perform public.rmc_personal_calendar(day,day); raise exception 'Revoked view permitted'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_calendar_closures(); raise exception 'Revoked management permitted'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_preview_closure_schedule(day,day,array[scope]); raise exception 'Revoked date management permitted'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 update public.rmc_roles set data=jsonb_set(data,'{permissions}','["calendar.manage_closures","calendar.manage_schoolwide"]') where id=custom_id;
 execute 'set local role authenticated';
 perform public.rmc_preview_closure(day,day,'{}');
 execute 'reset role';
 update public.rmc_roles set data=jsonb_set(data,'{permissions}','[]') where id='admin';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 execute 'set local role authenticated';
 begin perform public.rmc_personal_calendar(day,day); raise exception 'Admin bypassed disabled view'; exception when insufficient_privilege then null; end;
 begin perform public.rmc_calendar_closures(); raise exception 'Admin bypassed disabled management'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
rollback;
