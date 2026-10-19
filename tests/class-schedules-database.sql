-- All fixtures and schedule/event writes are rolled back.
begin;
do $$
declare admin_id uuid; osas_id uuid; ssg_id uuid; student_id uuid; tomorrow text:=((now() at time zone 'Asia/Manila')::date+1)::text; next_day text:=((now() at time zone 'Asia/Manila')::date+2)::text; ids jsonb; ev jsonb; failed boolean; p jsonb;
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict osas_id from public.rmc_profiles where is_test_account and role_id='ossa' and status='active' limit 1;
 select id into strict ssg_id from public.rmc_profiles where is_test_account and role_id='ssg' and status='active' limit 1;
 select id into strict student_id from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values('schedule-test-root','{"name":"Schedule test root","type":"school"}'),('schedule-outside','{"name":"Outside class","type":"section"}');
 insert into public.rmc_nodes(id,parent_id,data) values('schedule-test-class','schedule-test-root','{"name":"Schedule test class","type":"section","metadata":{"shortCode":"KEEP"}}');
 update public.rmc_profiles set node_id='schedule-test-root',profile=jsonb_set(profile,'{official_data}','{"assignment_node_id":"schedule-test-root"}') where id in (osas_id,ssg_id);
 update public.rmc_profiles set node_id='schedule-test-class',profile=jsonb_set(profile,'{school_data}','{"academic_assignment":{"terminalGroupId":"schedule-test-class"}}') where id=student_id;
 perform public.rmc_set_class_schedule('schedule-test-class','{"1":{"status":"classes","timeIn":"10:00","timeOut":"17:00"},"5":{"status":"no_class"}}');
 if not exists(select 1 from public.rmc_nodes where id='schedule-test-class' and data#>>'{metadata,shortCode}'='KEEP' and data#>>'{metadata,classSchedule,1,timeIn}'='10:00') then raise exception 'Schedule did not persist or damaged other metadata.'; end if;
 perform set_config('request.jwt.claim.sub',osas_id::text,true);
 perform public.rmc_set_class_schedule('schedule-test-class','{"1":{"status":"classes","timeIn":"10:00","timeOut":"12:00"}}');
 failed:=false;
 begin perform public.rmc_set_class_schedule('schedule-outside','{}'); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'OSAS wrote outside scope.'; end if;
 failed:=false;
 begin perform public.rmc_set_class_schedule('schedule-test-class','{"1":{"status":"classes","timeIn":"12:00","timeOut":"10:00"}}'); exception when others then failed:=true; end;
 if not failed then raise exception 'Reversed class times accepted.'; end if;
 failed:=false;
 begin perform public.rmc_set_class_schedule('schedule-test-class','{"7":{"status":"no_class"}}'); exception when others then failed:=true; end;
 if not failed then raise exception 'Invalid weekday accepted.'; end if;
 perform set_config('request.jwt.claim.sub',ssg_id::text,true);
 failed:=false;
 begin perform public.rmc_set_class_schedule('schedule-test-class','{}'); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'SSG edited regular class schedule.'; end if;
 failed:=false;
 begin update public.rmc_nodes set data=jsonb_set(data,'{metadata,classSchedule}','{}') where id='schedule-test-class'; exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Generic node update bypassed role restriction.'; end if;
 perform set_config('request.jwt.claim.sub',student_id::text,true);
 failed:=false;
 begin perform public.rmc_set_class_schedule('schedule-test-class','{}'); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Student edited class schedule.'; end if;
 if has_function_privilege('anon','public.rmc_set_class_schedule(text,jsonb)','execute') then raise exception 'Anonymous schedule access enabled.'; end if;
 perform set_config('request.jwt.claim.sub',osas_id::text,true);
 ev:=jsonb_build_object('kind','flag_ceremony','title','Date exemption test','description','Rolled back','status','upcoming','scopeNodeId','schedule-test-root',
 'audienceTarget','{"mode":"all"}'::jsonb,'participantsType','all','target','{"all":true}'::jsonb,
 'penaltyValue',1,'penaltyUnit','hours','geofenceEnabled',false,'location','{"lat":0,"lng":0,"radius_meters":0}'::jsonb,
 'attendanceWindows','[{"id":"window-1","timeIn":"07:00","timeOut":"08:00","lateAfterMinutes":15}]'::jsonb,
 'ceremony',jsonb_build_object('exemptStudentIds','[]'::jsonb,'allowVolunteerMerit',false,'volunteerMeritHours',1,'classWindows','{}'::jsonb,'exemptStudentIdsByDate',jsonb_build_object(tomorrow,jsonb_build_array(student_id))));
 ids:=public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow,next_day));
 if not exists(select 1 from public.rmc_events where id=(ids->>0)::uuid and data#>'{ceremony,exemptStudentIds}' ? student_id::text and not (data->'ceremony' ? 'exemptStudentIdsByDate')) then raise exception 'Date exemption not materialized.'; end if;
 if exists(select 1 from public.rmc_events where id=(ids->>1)::uuid and data#>'{ceremony,exemptStudentIds}' ? student_id::text) then raise exception 'Exemption leaked to another day.'; end if;
 select profile into p from public.rmc_profiles where id=student_id;
 if app_private.recipient((select data from public.rmc_events where id=(ids->>0)::uuid),p) then raise exception 'Exempt student still a required recipient.'; end if;
 if not app_private.recipient((select data from public.rmc_events where id=(ids->>1)::uuid),p) then raise exception 'Other date incorrectly exempted.'; end if;
 -- Changing the class schedule must not silently change already saved attendance rules.
 perform public.rmc_set_class_schedule('schedule-test-class','{}');
 if not exists(select 1 from public.rmc_events where id=(ids->>0)::uuid and data#>'{ceremony,exemptStudentIds}' ? student_id::text) then raise exception 'Saved exemption changed with class schedule.'; end if;
 update public.rmc_profiles set node_id='schedule-outside' where id=student_id;
 failed:=false;
 begin perform public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow,next_day)); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Out-of-scope date exemption was accepted.'; end if;
end $$;
rollback;
