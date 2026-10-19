begin;
do $$
declare admin_id uuid; student uuid; unit text:='date-calendar-'||gen_random_uuid(); parent uuid:=gen_random_uuid(); child_a uuid:=gen_random_uuid(); child_b uuid:=gen_random_uuid(); single_event uuid:=gen_random_uuid();
 day date:=(now() at time zone 'Asia/Manila')::date+3; d jsonb; preview jsonb; plans jsonb; cid uuid; before_count integer; original timestamptz;
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict student from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_nodes(id,data) values(unit,'{"name":"Calendar date test","type":"section"}');
 update public.rmc_profiles set node_id=unit,profile=app_private.assign_profile(profile,unit) where id=student;
 d:=jsonb_build_object('kind','attendance','status','upcoming','geofenceEnabled',false,'penaltyValue',0,'penaltyUnit','hours','description','Schedule verification','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student::text)));
 insert into public.rmc_events(id,node_id,created_by,start_at,end_at,data) values
 (parent,unit,admin_id,(day+time '08:00') at time zone 'Asia/Manila',(day+3+time '18:00') at time zone 'Asia/Manila',d||jsonb_build_object('title','School Week','isGeneralEvent',true,'startTime',extract(epoch from (day+time '08:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+3+time '18:00') at time zone 'Asia/Manila')*1000));
 insert into public.rmc_events(id,node_id,created_by,start_at,end_at,data) values
 (child_a,unit,admin_id,(day+time '09:00') at time zone 'Asia/Manila',(day+time '10:00') at time zone 'Asia/Manila',d||jsonb_build_object('title','Opening Program','parentEventId',parent,'startTime',extract(epoch from (day+time '09:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+time '10:00') at time zone 'Asia/Manila')*1000)),
 (child_b,unit,admin_id,(day+1+time '11:00') at time zone 'Asia/Manila',(day+1+time '12:00') at time zone 'Asia/Manila',d||jsonb_build_object('title','Closing Program','kind','merit','meritHours',0.5,'attendanceWindows',jsonb_build_array(jsonb_build_object('id','merit-window','label','Closing session','timeIn','11:00','timeOut','12:00','lateAfterMinutes',15)),'parentEventId',parent,'startTime',extract(epoch from (day+1+time '11:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+1+time '12:00') at time zone 'Asia/Manila')*1000)),
 (single_event,unit,admin_id,(day+time '14:00') at time zone 'Asia/Manila',(day+time '15:00') at time zone 'Asia/Manila',d||jsonb_build_object('title','Standalone Program','kind','service','service',jsonb_build_object('overflow','merit'),'attendanceWindows',jsonb_build_array(jsonb_build_object('id','service-window','label','Service session','timeIn','14:00','timeOut','15:00','lateAfterMinutes',15)),'startTime',extract(epoch from (day+time '14:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+time '15:00') at time zone 'Asia/Manila')*1000));
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit]);
 if not exists(select 1 from jsonb_array_elements(preview->'activities') x where x->>'id'=parent::text and (x->>'general')::boolean) or not exists(select 1 from jsonb_array_elements(preview->'activities') x where x->>'id'=child_b::text) then raise exception 'General event and related specific activities missing'; end if;
 -- A sibling's attendance prevents moving the entire group, even outside the closure date.
 execute 'reset role';
 insert into public.rmc_attendance values(child_b,student,'default','{"status":"present","slot":"default"}');
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit],jsonb_build_array(jsonb_build_object('event_id',parent,'date',day+5)));
 if (preview->>'plan_valid')::boolean then raise exception 'Group with recorded sibling attendance allowed'; end if;
 execute 'reset role';
 delete from public.rmc_attendance where event_id=child_b;
 insert into public.rmc_calendar_closures(title,reason,kind,starts_on,ends_on,node_ids,created_by)
 values('Destination closed','Official destination closure','holiday',day+8,day+8,array[unit],admin_id) returning id into cid;
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit],jsonb_build_array(jsonb_build_object('event_id',single_event,'date',day+8)));
 if (preview->>'plan_valid')::boolean then raise exception 'Move into saved holiday allowed'; end if;
 execute 'reset role'; delete from public.rmc_calendar_closures where id=cid; execute 'set local role authenticated';
 plans:=jsonb_build_array(jsonb_build_object('event_id',child_a,'date',day+8));
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit],plans);
 if (preview->>'plan_valid')::boolean then raise exception 'Out-of-parent activity allowed'; end if;
 begin perform public.rmc_apply_closure_schedule(day,day,array[unit],'Invalid move','Official reason','suspension',plans,preview->>'token'); raise exception 'Invalid dates applied'; exception when others then if sqlerrm='Invalid dates applied' then raise; end if; end;
 -- Ordinary event edits retain immediate containment validation.
 execute 'reset role';
 begin update public.rmc_events set end_at=(day+4+time '10:00') at time zone 'Asia/Manila',data=data||jsonb_build_object('endTime',extract(epoch from (day+4+time '10:00') at time zone 'Asia/Manila')*1000) where id=child_a; raise exception 'Ordinary update bypassed containment'; exception when others then if sqlerrm='Ordinary update bypassed containment' then raise; end if; end;
 execute 'set local role authenticated';
 plans:=jsonb_build_array(jsonb_build_object('event_id',parent,'date',day+5),jsonb_build_object('event_id',single_event,'date',day+2));
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit],plans);
 if (preview->>'plan_valid')::boolean is not true or (preview->>'moved_count')::int<>4 then raise exception 'General group and independent date plan invalid'; end if;
 execute 'reset role';
 update public.rmc_events set data=data||'{"description":"Changed since preview"}' where id=single_event;
 select count(*) into before_count from public.rmc_calendar_closures;
 execute 'set local role authenticated';
 begin perform public.rmc_apply_closure_schedule(day,day,array[unit],'Stale move','Official reason','suspension',plans,preview->>'token'); raise exception 'Stale preview accepted'; exception when others then if sqlerrm='Stale preview accepted' then raise; end if; end;
 preview:=public.rmc_preview_closure_schedule(day,day,array[unit],plans);
 cid:=public.rmc_apply_closure_schedule(day,day,array[unit],'Move School Week','Official school suspension','suspension',plans,preview->>'token');
 execute 'reset role';
 if (select count(*) from public.rmc_calendar_closures)<>before_count+1 then raise exception 'Atomic closure count incorrect'; end if;
 if (select start_at from public.rmc_events where id=parent)<>((day+5+time '08:00') at time zone 'Asia/Manila')
 or (select start_at from public.rmc_events where id=child_a)<>((day+5+time '09:00') at time zone 'Asia/Manila')
 or (select start_at from public.rmc_events where id=child_b)<>((day+6+time '11:00') at time zone 'Asia/Manila')
 or (select start_at from public.rmc_events where id=single_event)<>((day+2+time '14:00') at time zone 'Asia/Manila') then raise exception 'Dates, times or relative child dates changed incorrectly'; end if;
 if (select count(*) from public.rmc_audit where action='calendar.reschedule' and data->>'closure_id'=cid::text)<>4 then raise exception 'Missing grouped audit history'; end if;
 if (select data->>'kind' from public.rmc_events where id=child_b)<>'merit'
 or (select (data->>'meritHours')::numeric from public.rmc_events where id=child_b)<>0.5
 or (select data#>>'{attendanceWindows,0,timeIn}' from public.rmc_events where id=child_b)<>'11:00'
 or (select data#>>'{service,overflow}' from public.rmc_events where id=single_event)<>'merit'
 or (select data#>>'{attendanceWindows,0,timeOut}' from public.rmc_events where id=single_event)<>'15:00' then raise exception 'Merit or service settings were lost during rescheduling'; end if;
 -- A specific activity can move independently within its parent's dates.
 plans:=jsonb_build_array(jsonb_build_object('event_id',child_a,'date',day+7));
 execute 'set local role authenticated';
 preview:=public.rmc_preview_closure_schedule(day+5,day+5,array[unit],plans);
 if (preview->>'plan_valid')::boolean is not true then raise exception 'Independent child move within parent rejected'; end if;
 perform public.rmc_apply_closure_schedule(day+5,day+5,array[unit],'Move opening only','Official reason','suspension',plans,preview->>'token');
 execute 'reset role';
 if (select start_at from public.rmc_events where id=parent)<>((day+5+time '08:00') at time zone 'Asia/Manila') or (select start_at from public.rmc_events where id=child_b)<>((day+6+time '11:00') at time zone 'Asia/Manila') then raise exception 'Independent child move changed the parent or sibling'; end if;
 execute 'set local role authenticated';
 preview:=public.rmc_personal_calendar(day+5,day+8);
 if not exists(select 1 from jsonb_array_elements(preview->'items') x where x->>'event_id'=child_a::text and x->>'parent_event_id'=parent::text and not (x->>'general')::boolean)
 or not exists(select 1 from jsonb_array_elements(preview->'items') x where x->>'event_id'=parent::text and (x->>'general')::boolean) then raise exception 'Calendar general and specific relationships missing'; end if;
 -- General details include activities beyond the requested day, with their windows.
 preview:=public.rmc_personal_calendar(day+5,day+5);
 if not exists(select 1 from jsonb_array_elements(preview->'items') x where x->>'event_id'=parent::text
  and jsonb_array_length(x#>'{details,specific_activities}')=2
  and exists(select 1 from jsonb_array_elements(x#>'{details,specific_activities}') child where child->>'id'=child_b::text and child#>>'{windows,0,timeIn}'='11:00')) then raise exception 'General details omitted activities outside selected day or their windows'; end if;
 -- Parent visibility does not expose a child targeted to another student.
 execute 'reset role';
 insert into public.rmc_events(node_id,created_by,start_at,end_at,data)
 values(unit,admin_id,(day+5+time '11:00') at time zone 'Asia/Manila',(day+5+time '12:00') at time zone 'Asia/Manila',d||jsonb_build_object('title','Hidden activity','startTime',extract(epoch from (day+5+time '11:00') at time zone 'Asia/Manila')*1000,'endTime',extract(epoch from (day+5+time '12:00') at time zone 'Asia/Manila')*1000,'parentEventId',parent,'audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array((select id::text from public.rmc_profiles where is_test_account and role_id='mayor' and status='active' limit 1)))));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'aal','aal2')::text,true); perform set_config('request.jwt.claim.sub',student::text,true);
 execute 'set local role authenticated';
 preview:=public.rmc_personal_calendar(day+5,day+5);
 if exists(select 1 from jsonb_array_elements(preview->'items') x, lateral jsonb_array_elements(coalesce(x#>'{details,specific_activities}','[]')) child where child->>'title'='Hidden activity') then raise exception 'General details leaked inaccessible specific activity'; end if;
end $$;
rollback;
select 'PASS: general and specific date plans, relative schedules, different destinations, stale previews, atomic application, audit and ordinary containment checks' result;
