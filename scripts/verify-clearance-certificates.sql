-- Run in a transaction and ROLLBACK. Uses only marked demonstration accounts.
do $$
declare student uuid; reviewer uuid; administrator uuid; sid uuid; future_id uuid; c jsonb; again jsonb; v jsonb; schedules jsonb; denied boolean;
begin
 select id into strict student from public.rmc_profiles where is_test_account and role_id='student' limit 1;
 select id into strict reviewer from public.rmc_profiles where is_test_account and role_id='ossa' limit 1;
 select id into strict administrator from public.rmc_profiles where is_test_account and role_id='admin' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
 insert into public.rmc_nodes(id,data) values('clearance-test-scope','{"name":"Clearance Test School","type":"school"}');
 insert into public.rmc_nodes(id,parent_id,data) values
  ('clearance-test-academic','clearance-test-scope','{"name":"Highest Academic Unit","type":"education_unit"}'),
  ('clearance-test-section','clearance-test-academic','{"name":"Demo section","type":"section"}');
 update public.rmc_profiles set node_id='clearance-test-scope',status='active' where id in (student,reviewer);
 update public.rmc_profiles set node_id='clearance-test-section' where id=student;
 -- Start from a known balance before the schedule exists. These changes are rolled back.
 perform app_private.sanction(student,-app_private.balance(student),'Clearance test setup');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal2')::text,true);
 schedules:=public.rmc_clearance('create',jsonb_build_object('title','Demo clearing schedule',
  'starts_at',date_trunc('minute',statement_timestamp()),'ends_at',statement_timestamp()+interval '1 hour'));
 sid:=(schedules->0->>'id')::uuid;
 schedules:=public.rmc_clearance('create',jsonb_build_object('title','Future clearing schedule',
  'starts_at',statement_timestamp()+interval '2 hours','ends_at',statement_timestamp()+interval '3 hours'));
 future_id:=(schedules->0->>'id')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated','aal','aal2')::text,true);
 denied:=false;
 begin perform public.rmc_clearance('release',jsonb_build_object('schedule_id',sid,'enabled',true)); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Student must not release certificates';
 denied:=false;
 begin perform public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid)); exception when others then denied:=true; end;
 assert denied,'Initial zero balance must not qualify';
 perform app_private.sanction(student,2,'Clearance test sanction');
 perform app_private.sanction(student,-1,'Partial clearance test');
 assert not exists(select 1 from app_private.clearance_qualifications where student_id=student),'Partial clearing must not qualify';
 perform app_private.sanction(student,-1,'Complete clearance test');
 assert exists(select 1 from app_private.clearance_qualifications where schedule_id=sid and student_id=student),'Clearing in schedule must qualify';
 assert not exists(select 1 from app_private.clearance_qualifications where schedule_id=future_id and student_id=student),'Clearing outside schedule must not qualify';
 denied:=false;
 begin perform public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid)); exception when others then denied:=true; end;
 assert denied,'OSSA hold must block issuance';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal2')::text,true);
 perform public.rmc_clearance('release',jsonb_build_object('schedule_id',sid,'enabled',true));
 -- Scope checks and no backdating.
 denied:=false;
 begin perform public.rmc_clearance('create',jsonb_build_object('title','Backdated schedule','starts_at',statement_timestamp()-interval '1 day','ends_at',statement_timestamp()+interval '1 hour')); exception when others then denied:=true; end;
 assert denied,'Backdated clearing schedules must be blocked';
 update public.rmc_profiles set node_id=null where id=reviewer;
 denied:=false;
 begin perform public.rmc_clearance('release',jsonb_build_object('schedule_id',sid,'enabled',false)); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Unassigned reviewer must be blocked';
 update public.rmc_profiles set node_id='clearance-test-scope' where id=reviewer;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated','aal','aal2')::text,true);
 c:=public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid));
 again:=public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid));
 assert c->>'id'=again->>'id','Repeat downloads must reuse reference and issue date';
 assert c->>'reference' like 'CLR-%','Certificate must have a reference';
 assert c#>>'{details,school_name}'='Highest Academic Unit','School name must use the highest academic unit below the campus container';
 assert c#>>'{details,authorized_by}' is not null,'Certificate must record OSSA release authority';
 v:=public.rmc_verify_clearance(c->>'token');
 assert (v->>'valid')::boolean,'Certificate must verify';
 assert not (v ?| array['student_number','student_id','email','sanctions','attendance','details','token']),'Verification must minimize personal data';
 perform app_private.sanction(student,1,'New sanction test');
 assert not (public.rmc_verify_clearance(c->>'token')->>'valid')::boolean,'New sanctions must invalidate certificate';
 perform app_private.sanction(student,-1,'Reclear test');
 assert not (public.rmc_verify_clearance(c->>'token')->>'valid')::boolean,'Old revoked certificate must stay invalid after reclearing';
 again:=public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid));
 assert again->>'id'<>c->>'id','Reclearing must create a new certificate';
 assert (public.rmc_verify_clearance(again->>'token')->>'valid')::boolean,'New certificate must verify';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal2')::text,true);
 perform public.rmc_clearance('release',jsonb_build_object('schedule_id',sid,'enabled',false));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated','aal','aal2')::text,true);
 denied:=false;
 begin perform public.rmc_clearance('issue',jsonb_build_object('schedule_id',sid)); exception when others then denied:=true; end;
 assert denied,'Hold must also block repeat downloads';
 assert (public.rmc_verify_clearance(again->>'token')->>'valid')::boolean,'Hold must preserve issued verification history';
 perform app_private.sanction(student,2,'Offline replacement test',null,'clearance-test-removed-charge');
 assert not (public.rmc_verify_clearance(again->>'token')->>'valid')::boolean,'A new charge must revoke before offline replacement';
 delete from public.rmc_sanctions where source='clearance-test-removed-charge';
 assert exists(select 1 from app_private.clearance_qualifications where schedule_id=sid and student_id=student),'Removing an incorrect charge during the schedule must qualify';
 assert not (public.rmc_verify_clearance(again->>'token')->>'valid')::boolean,'Removing a charge must not revive the old certificate';
 assert public.rmc_verify_clearance('invalid')='{"found":false}'::jsonb,'Invalid tokens must not expose records';
 assert not has_table_privilege('anon','app_private.clearance_certificates','SELECT'),'Anon must not read certificates';
 assert not has_table_privilege('authenticated','app_private.clearance_certificates','INSERT'),'Clients must not forge certificates';
 assert not has_function_privilege('anon','public.rmc_clearance(text,jsonb)','EXECUTE'),'Anon must not manage or issue';
 assert has_function_privilege('anon','public.rmc_verify_clearance(text)','EXECUTE'),'Anon must be able to verify';
end $$;

-- Exercise the actual anonymous SQL role and wrapper permissions.
set local role anon;
select public.rmc_verify_clearance(repeat('0',64)) as unknown_token;
reset role;
