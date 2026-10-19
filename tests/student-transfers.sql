-- Run against a database with an active admin and at least three other profiles.
-- The caller must wrap this file in BEGIN / ROLLBACK. No test changes are retained.
do $$
declare admin_id uuid; staff_id uuid; first_id uuid; second_id uuid; n integer; changes jsonb;
begin
  select id into strict admin_id from public.rmc_profiles where role_id='admin' and status='active' limit 1;
  select id into strict staff_id from public.rmc_profiles where id<>admin_id order by is_test_account desc, id limit 1;
  select id into strict first_id from public.rmc_profiles where id not in (admin_id,staff_id) order by is_test_account desc,id limit 1;
  select id into strict second_id from public.rmc_profiles where id not in (admin_id,staff_id,first_id) order by is_test_account desc,id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
  insert into public.rmc_nodes(id,parent_id,data) values
    ('transfer-test-campus',null,'{"id":"transfer-test-campus","name":"Transfer test campus","type":"campus"}'),
    ('transfer-test-other',null,'{"id":"transfer-test-other","name":"Other campus","type":"campus"}'),
    ('transfer-test-a','transfer-test-campus','{"id":"transfer-test-a","name":"Class A","type":"block"}'),
    ('transfer-test-b','transfer-test-campus','{"id":"transfer-test-b","name":"Class B","type":"block"}'),
    ('transfer-test-outside','transfer-test-other','{"id":"transfer-test-outside","name":"Outside","type":"block"}');
  update public.rmc_profiles set role_id='ossa',status='active',node_id='transfer-test-campus',
    profile=app_private.assign_profile(profile||'{"role":"ossa","account_status":"active"}', 'transfer-test-campus',true) where id=staff_id;
  update public.rmc_profiles set role_id='student',status='active',node_id='transfer-test-a',
    profile=app_private.assign_profile(profile||'{"role":"student","account_status":"active"}', 'transfer-test-a') where id=first_id;
  update public.rmc_profiles set role_id='mayor',status='active',node_id='transfer-test-a',
    profile=app_private.assign_profile(profile||'{"role":"mayor","account_status":"active"}', 'transfer-test-a',true) where id=second_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2')::text,true);
  select jsonb_agg(jsonb_build_object('uid',id,'student_id',profile->>'student_id','source_node_id',node_id,'destination_node_id','transfer-test-b') order by id)
    into changes from public.rmc_profiles where id in (first_id,second_id);
  if jsonb_array_length(public.rmc_transfer_roster()) <> 2 then raise exception 'Roster scope failed'; end if;
  begin
    perform public.rmc_transfer_students(jsonb_set(changes,'{1,destination_node_id}','"transfer-test-outside"'));
    raise exception 'Out-of-scope batch was accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.rmc_profiles where id in(first_id,second_id) and node_id<>'transfer-test-a') then raise exception 'Partial transfer escaped rollback'; end if;
  begin
    perform public.rmc_transfer_students(changes||changes);
    raise exception 'Duplicate batch was accepted';
  exception when raise_exception then if sqlerrm<>'Duplicate student in transfer batch.' then raise; end if; end;
  update public.rmc_nodes set data=jsonb_set(data,'{metadata}','{"archived":true}') where id='transfer-test-b';
  begin
    perform public.rmc_transfer_students(changes);
    raise exception 'Archived destination accepted';
  exception when raise_exception then if sqlerrm<>'This academic unit is archived.' then raise; end if; end;
  update public.rmc_nodes set data=data-'metadata' where id='transfer-test-b';
  n := public.rmc_transfer_students(changes);
  if n<>2 or exists(select 1 from public.rmc_profiles where id in(first_id,second_id) and
    (node_id<>'transfer-test-b' or role_id<>'student' or profile#>>'{school_data,academic_assignment,terminalGroupId}'<>'transfer-test-b' or profile ? 'official_data')) then
    raise exception 'Transfer assignment or mayor demotion failed';
  end if;
  if (select count(*) from public.rmc_audit where action='transferStudent' and target in(first_id::text,second_id::text))<>2 then raise exception 'Missing transfer audits'; end if;
  begin
    perform public.rmc_transfer_students(changes);
    raise exception 'Stale batch was accepted';
  exception when raise_exception then if sqlerrm<>'Student identity or assignment changed. Export a fresh template.' then raise; end if; end;
  update public.rmc_roles set data=jsonb_set(data,'{permissions}',(data->'permissions')-'directory.transfer_students') where id='ossa';
  begin
    perform public.rmc_transfer_roster(); raise exception 'Revoked transfer permission accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',first_id,'role','authenticated','aal','aal2')::text,true);
  begin
    perform public.rmc_transfer_students(changes); raise exception 'Student transfer permission accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
  update public.rmc_profiles set node_id=null where id=first_id;
  n := public.rmc_transfer_students(jsonb_build_array(jsonb_build_object('uid',first_id,
    'student_id',(select profile->>'student_id' from public.rmc_profiles where id=first_id),
    'source_node_id','','destination_node_id','transfer-test-b')));
  if n<>1 or (select node_id from public.rmc_profiles where id=first_id)<>'transfer-test-b' then raise exception 'Unassigned student transfer failed'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.rmc_transfer_roster(); raise exception 'Anonymous export accepted';
  exception when insufficient_privilege then null; end;
end $$;
select 'PASS: scope, atomic rollback, duplicate/stale/archive rejection, assignment rebuild, mayor demotion, audits, RBAC revocation, unassigned transfer, student and anonymous denial' as result;
