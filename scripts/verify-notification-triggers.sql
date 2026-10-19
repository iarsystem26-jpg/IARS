-- All fixtures and generated notices roll back; no existing records are changed.
begin;
do $$
declare student public.rmc_profiles; admin_id uuid; ev public.rmc_events; ex uuid := gen_random_uuid(); d jsonb;
begin
 select * into strict student from public.rmc_profiles where role_id='student' and status='active' limit 1;
 select id into strict admin_id from public.rmc_profiles where role_id='admin' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 delete from public.rmc_notifications where user_id=student.id and source='welcome';
 update public.rmc_profiles set status='active' where id=student.id;
 if not exists(select 1 from public.rmc_notifications where user_id=student.id and source='welcome') then raise exception 'Missing welcome'; end if;
 d:=jsonb_build_object('title','Notification trigger verification','kind','attendance','status','upcoming',
  'participantsType','specific','audienceTarget',jsonb_build_object('mode','specific_people','specificUserIds',jsonb_build_array(student.id)),
  'penaltyValue',0,'penaltyUnit','hours','geofenceEnabled',false,
  'startTime',extract(epoch from now()+interval '30 minutes')*1000,'endTime',extract(epoch from now()+interval '90 minutes')*1000);
 insert into public.rmc_events(created_by,data,start_at,end_at) values(admin_id,d,now()+interval '30 minutes',now()+interval '90 minutes') returning * into ev;
 if (select count(*) from public.rmc_notifications where source like 'event:'||ev.id||':scheduled:%')<>1 then raise exception 'Scheduled audience mismatch'; end if;
 perform app_private.notification_reminders(); perform app_private.notification_reminders();
 if (select count(*) from public.rmc_notifications where user_id=student.id and source like 'event:'||ev.id||':soon:%')<>1 then raise exception 'Reminder missing or duplicated'; end if;
 update public.rmc_events set start_at=now()-interval '1 minute',data=jsonb_set(data,'{startTime}',to_jsonb(extract(epoch from now()-interval '1 minute')*1000)) where id=ev.id;
 perform app_private.notification_reminders();
 if not exists(select 1 from public.rmc_notifications where user_id=student.id and source like 'event:'||ev.id||':started:%') then raise exception 'Start reminder missing'; end if;
 insert into storage.objects(bucket_id,name) values('rmc-documents',student.id||'/excuses/'||ex||'.pdf');
 insert into public.rmc_excuses(id,student_id,event_id,data) values(ex,student.id,ev.id,
  jsonb_build_object('status','pending','event_title','Notification trigger verification','category','medical','reason','Verification medical explanation',
   'proof_url','storage://'||student.id||'/excuses/'||ex||'.pdf'));
 update public.rmc_excuses set data=data||'{"status":"approved","review_notes":"Test approval"}' where id=ex;
 if (select count(*) from public.rmc_notifications where user_id=student.id and source like 'excuse:'||ex||':%')<>2 then raise exception 'Excuse progression missing'; end if;
 insert into public.rmc_settings(id,data) values('system_update','{"title":"Notification verification","message":"Test update"}')
 on conflict(id) do update set data=excluded.data;
 if not exists(select 1 from public.rmc_notifications where user_id=student.id and title='Notification verification') then raise exception 'System update missing'; end if;
end $$;
select 'PASS welcome, scoped schedule, idempotent reminders, event start, excuse progress, system update' as result;
rollback;
