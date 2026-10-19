-- Runs inside the caller's transaction; fixtures never send real email.
do $$ declare actor uuid; begin
 select id into strict actor from public.rmc_profiles where role_id='admin' and status='active' limit 1;
 perform set_config('test.email_actor',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
 delete from public.rmc_account_freezes where account_id=actor;
 update public.rmc_settings set data='{"isFrozen":false}' where id='system_freeze';
 update public.rmc_settings set data='{}' where id='frozen_nodes';
end $$;
insert into public.rmc_auth_email_queue(event_key,payload,kind) select 'history-test-'||n,'encrypted','recovery' from generate_series(1,12) n;
update public.rmc_email_history set recipient='history@example.test',subject='Unique history test',preview_html='<p>Safe preview</p>',preview_text='Safe preview' where id in (select id from public.rmc_auth_email_queue where event_key like 'history-test-%');
update public.rmc_auth_email_queue set status='sent',sent_at=now(),payload='' where event_key like 'history-test-%';
set local role authenticated;
do $$ declare result jsonb; item uuid; begin
 result:=public.rmc_email_history_list('sent','Unique history test','','',0,1,10);
 if (result->>'total')::integer<>12 or jsonb_array_length(result->'rows')<>10 then raise exception 'Pagination count failed';end if;
 result:=public.rmc_email_history_list('sent','Unique history test','recovery','',0,2,10);
 if jsonb_array_length(result->'rows')<>2 then raise exception 'Second page failed';end if;
 if (public.rmc_email_history_list('queue','Unique history test','','',0,1,10)->>'total')::integer<>0 then raise exception 'Sent rows leaked into queue';end if;
 if (public.rmc_email_history_list('sent','%','','',0,1,10)->>'total')::integer<>0 then raise exception 'Search wildcard not escaped';end if;
 item:=(result->'rows'->0->>'id')::uuid;
 if public.rmc_email_history_preview(item)->>'html'<>'<p>Safe preview</p>' then raise exception 'Preview failed';end if;
 if jsonb_array_length(public.rmc_email_history_analytics(7)->'daily')<>7 then raise exception 'Daily analytics failed';end if;
 begin perform count(*) from public.rmc_email_history;raise exception 'Direct table exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.rmc_auth_email_queue where event_key like 'history-test-%';
do $$ begin if (select count(*) from public.rmc_email_history where subject='Unique history test')<>12 then raise exception 'Queue cleanup removed history';end if;end $$;
update public.rmc_profiles set role_id='student',profile=profile||'{"role":"student"}' where id=current_setting('test.email_actor')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.rmc_email_history_list();raise exception 'Non-superadmin history allowed';exception when insufficient_privilege then null;end;
 begin perform public.rmc_email_history_preview(extensions.gen_random_uuid());raise exception 'Non-superadmin preview allowed';exception when insufficient_privilege then null;end;
 begin perform public.rmc_email_history_analytics();raise exception 'Non-superadmin analytics allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.rmc_email_history_list();raise exception 'Anonymous history allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Email history pagination, search, preview, analytics, retention and security passed' as result;
