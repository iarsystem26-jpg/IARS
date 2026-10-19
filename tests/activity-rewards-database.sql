-- All fixtures and credits are rolled back, including changes to test accounts.
begin;
do $$
declare
 admin_id uuid; student uuid; officer uuid; osas uuid; ev jsonb; eid uuid; eid2 uuid; receipt jsonb;
 day date:=(now() at time zone 'Asia/Manila')::date;
 start_at timestamptz:=date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
 span_seconds numeric; rendered numeric; fixed numeric:=2; failed boolean; saved_balance numeric;
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict student from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 select id into strict officer from public.rmc_profiles where is_test_account and role_id='ssg' and status='active' limit 1;
 select id into strict osas from public.rmc_profiles where is_test_account and role_id='ossa' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values('activity-reward-test','{"id":"activity-reward-test","name":"Activity reward test","type":"school"}');
 update public.rmc_profiles set node_id='activity-reward-test',profile=jsonb_set(profile,'{school_data,academic_assignment}','{"terminalGroupId":"activity-reward-test"}') where id=student;
 update public.rmc_profiles set node_id='activity-reward-test',profile=jsonb_set(profile,'{official_data}','{"assignment_node_id":"activity-reward-test"}') where id in (officer,osas);
 span_seconds:=least(600,extract(epoch from now()-start_at)/2);
 rendered:=round(span_seconds/3600,6);
 ev:=jsonb_build_object('kind','service','title','Service reward verification','description','Rollback test','status','active','scopeNodeId','activity-reward-test',
  'target','{"all":true}'::jsonb,'audienceTarget','{"mode":"all"}'::jsonb,'participantsType','all','service','{"overflow":"merit"}'::jsonb,
  'startTime',extract(epoch from start_at)*1000,'endTime',extract(epoch from ((day+1+'23:59'::time) at time zone 'Asia/Manila'))*1000,
  'penaltyValue',0,'penaltyUnit','hours','geofenceEnabled',false,'location','{"lat":0,"lng":0,"radius_meters":0}'::jsonb,
  'attendanceWindows','[{"id":"session","timeIn":"00:00","timeOut":"23:59","lateAfterMinutes":0}]'::jsonb);
 perform set_config('request.jwt.claim.sub',officer::text,true);
 failed:=false;
 begin perform public.rmc_command('createEvent',jsonb_build_array(ev)); exception when others then failed:=true; end;
 if not failed then raise exception 'SSG changed the OSAS overflow policy.'; end if;
 perform set_config('request.jwt.claim.sub',osas::text,true);
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 perform app_private.sanction(student,-app_private.balance(student),'Clear test balance');
 perform app_private.sanction(student,rendered/2,'Test balance');
 perform public.rmc_record_attendance(eid,student,'in',null,null,'Verify service scan');
 -- Fixture only: simulate elapsed server time within the current attendance window.
 update public.rmc_attendance set data=data||jsonb_build_object('time_in',extract(epoch from now())*1000-span_seconds*1000) where event_id=eid and student_id=student;
 receipt:=public.rmc_record_attendance(eid,student,'out',null,null,'Verify service scan');
 if abs((receipt->>'rendered_hours')::numeric-rendered)>0.000001 then raise exception 'Rendered service duration incorrect.'; end if;
 if abs((receipt->>'deducted_hours')::numeric-rendered/2)>0.000001 or app_private.balance(student)<>0 then raise exception 'Sanctions did not clear first.'; end if;
 if abs((receipt->>'merit_earned_hours')::numeric-rendered/2)>0.000001 then raise exception 'Excess service merit incorrect.'; end if;
 receipt:=public.rmc_record_attendance(eid,student,'out',null,null,'Duplicate service scan');
 if not (receipt->>'already_recorded')::boolean then raise exception 'Duplicate scan was credited twice.'; end if;
 if (select count(*) from public.rmc_merit_credits where event_id=eid)<>1 then raise exception 'Duplicate service credit.'; end if;
 perform public.rmc_extend_service(eid,day+3);
 if not exists(select 1 from public.rmc_events where id=eid and data->>'endDate'=(day+3)::text) then raise exception 'Service extension failed.'; end if;
 if not exists(select 1 from public.rmc_attendance where event_id=eid and data->>'time_out' is not null) then raise exception 'Extension lost attendance.'; end if;
 failed:=false;
 begin perform public.rmc_extend_service(eid,day+2); exception when others then failed:=true; end;
 if not failed then raise exception 'Service duration was shortened.'; end if;
 -- Clear-only service accepts attendance but saves no excess merit.
 ev:=jsonb_set(ev,'{service,overflow}','"clear"');
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 perform public.rmc_record_attendance(eid,student,'in',null,null,'Clear only scan');
 update public.rmc_attendance set data=data||jsonb_build_object('time_in',extract(epoch from now())*1000-span_seconds*1000) where event_id=eid and student_id=student;
 receipt:=public.rmc_record_attendance(eid,student,'out',null,null,'Clear only scan');
 if (receipt->>'merit_earned_hours')::numeric<>0 or exists(select 1 from public.rmc_merit_credits where event_id=eid) then raise exception 'Clear-only service banked excess.'; end if;
 -- A two-day merit activity cannot award on today's scan-out if yesterday is missing.
 ev:=(ev-'service')||jsonb_build_object('kind','merit','meritHours',fixed,'startTime',extract(epoch from start_at-interval '1 day')*1000,'endTime',extract(epoch from ((day+'23:59'::time) at time zone 'Asia/Manila'))*1000);
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 perform public.rmc_record_attendance(eid,student,'in',null,null,'Incomplete merit scan');
 receipt:=public.rmc_record_attendance(eid,student,'out',null,null,'Incomplete merit scan');
 if not (receipt->>'completion_pending')::boolean or (receipt->>'awarded_hours')::numeric<>0 then raise exception 'Merit awarded before completion.'; end if;
 -- With yesterday completed, final scan-out releases exactly the fixed award.
 eid2:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 insert into public.rmc_attendance(event_id,student_id,slot,data) values(eid2,student,(day-1)::text||':session',jsonb_build_object('status','present','time_in',extract(epoch from start_at-interval '1 hour')*1000,'time_out',extract(epoch from start_at-interval '30 minutes')*1000));
 perform public.rmc_record_attendance(eid2,student,'in',null,null,'Complete merit scan');
 receipt:=public.rmc_record_attendance(eid2,student,'out',null,null,'Complete merit scan');
 if (receipt->>'completion_pending')::boolean or (receipt->>'awarded_hours')::numeric<>fixed or (receipt->>'merit_earned_hours')::numeric<>fixed then raise exception 'Fixed completion award incorrect.'; end if;
 receipt:=public.rmc_record_attendance(eid2,student,'out',null,null,'Repeat completion scan');
 if (select count(*) from public.rmc_merit_credits where event_id=eid2)<>1 then raise exception 'Fixed merit awarded twice.'; end if;
 -- Standard schedule rejects a Tuesday raising even if date/time are otherwise valid.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 ev:=(ev-'meritHours')||jsonb_build_object('kind','flag_ceremony','ceremony','{"flagKind":"raising","useStandardSchedule":true,"exemptStudentIds":[],"allowVolunteerMerit":false,"volunteerMeritHours":1,"classWindows":{}}'::jsonb,
 'attendanceWindows','[{"id":"flag","timeIn":"07:00","timeOut":"07:30","lateAfterMinutes":5}]'::jsonb);
 failed:=false;
 begin perform public.rmc_create_ceremonies(ev,jsonb_build_array((day+case when extract(isodow from day+1)=1 then 2 else 1 end)::text)); exception when others then failed:=position('Standard flag raising' in sqlerrm)>0; end;
 if not failed then raise exception 'Invalid standard raising weekday accepted.'; end if;
 perform public.rmc_create_ceremonies(ev,jsonb_build_array((day+case when extract(isodow from day)=1 then 7 else (8-extract(isodow from day)::integer)%7 end)::text));
 ev:=jsonb_set(ev,'{ceremony,flagKind}','"retreat"')||jsonb_build_object('attendanceWindows','[{"id":"flag","timeIn":"16:30","timeOut":"17:00","lateAfterMinutes":5}]'::jsonb);
 perform public.rmc_create_ceremonies(ev,jsonb_build_array((day+case when extract(isodow from day)=5 then 7 else (12-extract(isodow from day)::integer)%7 end)::text));
 -- RLS: a student can read their own earned credits but cannot read or write another account's credits.
 insert into public.rmc_merit_credits(student_id,event_id,source,hours,actor_id) values(officer,eid2,'activity-test-other-credit',1,admin_id);
 perform set_config('request.jwt.claim.sub',student::text,true);
 set local role authenticated;
 if not exists(select 1 from public.rmc_merit_credits where student_id=student) then raise exception 'Student cannot read their earned merit.'; end if;
 if exists(select 1 from public.rmc_merit_credits where student_id<>student) then raise exception 'Merit credit privacy failed.'; end if;
 failed:=false;
 begin insert into public.rmc_merit_credits(student_id,event_id,source,hours) values(student,eid2,'forged-merit',99); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Student forged a merit credit.'; end if;
 reset role;
end $$;
select 'PASS: service duration, OSAS policy, overflow merit, duplicate scans, extensions, completion-only fixed merit, and flag standard validation' as result;
rollback;
