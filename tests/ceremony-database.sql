-- Run with `supabase db query --linked --file tests/ceremony-database.sql`.
-- Every fixture and attendance/sanction write is rolled back.
begin;
do $$
declare
 admin_id uuid; student_id uuid; volunteer_id uuid; officer_id uuid; osas_id uuid;
 ev jsonb; settings jsonb; ids jsonb; eid uuid; receipt jsonb; person jsonb;
 tomorrow text:=to_char((now() at time zone 'Asia/Manila')::date+1,'YYYY-MM-DD');
 too_far text:=to_char((date_trunc('month',now() at time zone 'Asia/Manila')+interval '2 months')::date,'YYYY-MM-DD');
 before_count integer; after_count integer; failed boolean;
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict student_id from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 select id into strict volunteer_id from public.rmc_profiles where is_test_account and role_id='mayor' and status='active' limit 1;
 select id into strict officer_id from public.rmc_profiles where is_test_account and role_id='ssg' and status='active' limit 1;
 select id into strict osas_id from public.rmc_profiles where is_test_account and role_id='ossa' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values ('ceremony-test-root','{"id":"ceremony-test-root","name":"Ceremony test root","type":"school"}');
 insert into public.rmc_nodes(id,parent_id,data) values
 ('ceremony-test-a','ceremony-test-root','{"id":"ceremony-test-a","name":"Ceremony class A","type":"section"}'),
 ('ceremony-test-b','ceremony-test-root','{"id":"ceremony-test-b","name":"Ceremony class B","type":"section"}');
 update public.rmc_profiles set node_id='ceremony-test-a',profile=jsonb_set(profile,'{school_data,academic_assignment}', '{"terminalGroupId":"ceremony-test-a","nodePathIds":["ceremony-test-root","ceremony-test-a"]}') where id=student_id;
 update public.rmc_profiles set node_id='ceremony-test-b',profile=(profile-'official_data')||jsonb_build_object('school_data',jsonb_build_object('academic_assignment',jsonb_build_object('terminalGroupId','ceremony-test-b','nodePathIds',jsonb_build_array('ceremony-test-root','ceremony-test-b')))) where id=volunteer_id;
 update public.rmc_profiles set node_id='ceremony-test-root',profile=jsonb_set(profile,'{official_data}', '{"assignment_node_id":"ceremony-test-root"}') where id in (officer_id,osas_id);
 settings:=jsonb_build_object('exemptStudentIds','[]'::jsonb,'allowVolunteerMerit',true,'volunteerMeritHours',1.5,'classWindows',jsonb_build_object('ceremony-test-a',jsonb_build_array(jsonb_build_object('id','class-a','timeIn','07:30','timeOut','08:30','lateAfterMinutes',10))));
 ev:=jsonb_build_object('kind','flag_ceremony','title','Ceremony database verification','description','Rolled back test',
  'status','upcoming','scopeNodeId','ceremony-test-root','target',jsonb_build_object('all',false),'participantsType','specific',
  'audienceTarget',jsonb_build_object('mode','directory_node','nodeId','ceremony-test-a'),
  'penaltyValue',1,'penaltyUnit','hours','sanctionRules','{"late":{"value":1,"unit":"hours"},"absent":{"value":1,"unit":"hours"}}'::jsonb,
  'geofenceEnabled',false,'location','{"lat":0,"lng":0,"radius_meters":0}'::jsonb,
  'attendanceWindows','[{"id":"default-window","timeIn":"07:00","timeOut":"08:00","lateAfterMinutes":15}]'::jsonb,'ceremony',settings);
 ids:=public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow));
 eid:=(ids->>0)::uuid;
 if jsonb_array_length(ids)<>1 then raise exception 'Expected one ceremony.'; end if;
 if not exists(select 1 from public.rmc_events where id=eid and data->>'startDate'=tomorrow and data->>'endDate'=tomorrow and (end_at at time zone 'Asia/Manila')::time='08:30') then raise exception 'Class windows did not expand schedule.'; end if;
 select profile into person from public.rmc_profiles where id=student_id;
 if app_private.ceremony_windows(ev,person)->0->>'id'<>'class-a' then raise exception 'Class-specific window was not selected.'; end if;
 if app_private.recipient(jsonb_set(ev,'{ceremony,exemptStudentIds}',jsonb_build_array(student_id)),person) then raise exception 'Exempt student remains a recipient.'; end if;
 if app_private.ceremony_volunteer(jsonb_set(ev,'{ceremony,exemptStudentIds}',jsonb_build_array(student_id)),person) then raise exception 'Exempt student can earn merit.'; end if;
 select count(*) into before_count from public.rmc_events;
 failed:=false;
 begin perform public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow,too_far)); exception when others then failed:=true; end;
 select count(*) into after_count from public.rmc_events;
 if not failed or before_count<>after_count then raise exception 'Date validation or atomic rollback failed.'; end if;
 failed:=false;
 begin perform public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow,tomorrow)); exception when others then failed:=true; end;
 if not failed then raise exception 'Duplicate dates accepted.'; end if;
 perform set_config('request.jwt.claim.sub',student_id::text,true);
 failed:=false;
 begin perform public.rmc_create_ceremonies(ev,jsonb_build_array(tomorrow)); exception when others then failed:=true; end;
 if not failed then raise exception 'Student was allowed to create ceremonies.'; end if;
 perform set_config('request.jwt.claim.sub',officer_id::text,true);
 settings:=jsonb_set(settings,'{classWindows,ceremony-test-a,0,timeIn}','"07:45"');
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,jsonb_build_object('title','SSG edited ceremony','ceremony',settings)));
 if not exists(select 1 from public.rmc_events where id=eid and data#>>'{ceremony,classWindows,ceremony-test-a,0,timeIn}'='07:45') then raise exception 'SSG class schedule was not saved.'; end if;
 perform set_config('request.jwt.claim.sub',osas_id::text,true);
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,jsonb_build_object('ceremony',jsonb_set(settings,'{exemptStudentIds}',jsonb_build_array(student_id)))));
 if not exists(select 1 from public.rmc_events where id=eid and data#>'{ceremony,exemptStudentIds}' ? student_id::text) then raise exception 'OSAS exemption was not saved.'; end if;
 -- Restrict officer to another class; editing the broader event must fail.
 update public.rmc_profiles set node_id='ceremony-test-b' where id=officer_id;
 perform set_config('request.jwt.claim.sub',officer_id::text,true);
 failed:=false;
 begin perform public.rmc_command('updateEvent',jsonb_build_array(eid,'{"title":"Forbidden"}'::jsonb)); exception when others then failed:=true; end;
 if not failed then raise exception 'Out-of-scope edit succeeded.'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 -- An event starting at the transaction timestamp lets us verify real scan RPCs.
 ev:=ev||jsonb_build_object('startTime',extract(epoch from now())*1000,'endTime',extract(epoch from now()+interval '10 minutes')*1000,
  'ceremony',jsonb_set(settings,'{classWindows}','{}'),
  'attendanceWindows','[{"id":"live","timeIn":"00:00","timeOut":"23:59","lateAfterMinutes":0}]'::jsonb);
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 perform app_private.sanction(volunteer_id,3,'Ceremony merit test balance',null,'ceremony-test-balance');
 receipt:=public.rmc_record_attendance(eid,volunteer_id,'in',null,null,'Ceremony test manual scan');
 if not (receipt->>'volunteer')::boolean then raise exception 'Non-recipient was not recorded as volunteer.'; end if;
 receipt:=public.rmc_record_attendance(eid,volunteer_id,'out',null,null,'Ceremony test manual scan');
 if (receipt->>'deducted_hours')::numeric<>1.5 then raise exception 'Volunteer merit incorrect.'; end if;
 receipt:=public.rmc_record_attendance(eid,volunteer_id,'out',null,null,'Ceremony test repeated scan');
 if not (receipt->>'already_recorded')::boolean then raise exception 'Repeated scan was not idempotent.'; end if;
 if (select count(*) from public.rmc_sanctions where source='merit:'||eid::text||':'||volunteer_id::text)<>1 then raise exception 'Merit awarded more than once.'; end if;
 if exists(select 1 from public.rmc_sanctions where source like 'late:'||eid::text||':'||volunteer_id::text||'%') then raise exception 'Volunteer received late sanction.'; end if;
 ev:=jsonb_set(ev,'{ceremony,allowVolunteerMerit}','false');
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 perform public.rmc_record_attendance(eid,volunteer_id,'in',null,null,'Ceremony without merit');
 receipt:=public.rmc_record_attendance(eid,volunteer_id,'out',null,null,'Ceremony without merit');
 if (receipt->>'deducted_hours')::numeric<>0 then raise exception 'Disabled merit still awarded hours.'; end if;
 if exists(select 1 from public.rmc_sanctions s where s.event_id=eid and s.student_id=volunteer_id) then raise exception 'Optional attendance changed sanctions without merit enabled.'; end if;

end $$;
select 'PASS: atomic dates, date limits, class windows, exemptions, role/scope checks, volunteer scanning, merit and duplicate scans' as result;
rollback;
