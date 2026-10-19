begin;
-- Transactional test: no emails are sent; all queues, budgets and role edits roll back.
delete from public.rmc_auth_email_queue;
update public.rmc_email_delivery_state set sent_count=0,window_started=now(),reset_at=now()+interval '24 hours',blocked_until=null;
set local role anon;
do $$ begin
 begin perform public.rmc_email_delivery_stats();raise exception 'Anonymous tracker allowed';exception when insufficient_privilege then null;end;
 begin perform public.rmc_enqueue_auth_email('x','encrypted',repeat('a',64),repeat('b',64),'signup');raise exception 'Anonymous enqueue allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare actor uuid;begin
 select id into strict actor from public.rmc_profiles where role_id='admin' and status='active' limit 1;
 perform set_config('test.email_actor',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
 delete from public.rmc_account_freezes where account_id=actor;
 update public.rmc_settings set data='{"isFrozen":false}' where id='system_freeze';
 update public.rmc_settings set data='{}' where id='frozen_nodes';
end $$;
set local role authenticated;
do $$ begin
 if (public.rmc_email_delivery_stats()->>'safety_limit')::integer<>90 then raise exception 'Superadmin tracker failed';end if;
 if (select count(*) from public.rmc_email_delivery_state)<>1 then raise exception 'Superadmin realtime policy failed';end if;
end $$;
reset role;
update public.rmc_profiles set role_id='student',profile=profile||'{"role":"student"}' where id=current_setting('test.email_actor')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.rmc_email_delivery_stats();raise exception 'Non-superadmin tracker allowed';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.rmc_email_delivery_state) then raise exception 'Non-superadmin realtime data leaked';end if;
end $$;
reset role;
set local role service_role;
do $$ declare result jsonb; message public.rmc_auth_email_queue; n integer;begin
 result:=public.rmc_enqueue_auth_email('event-one','encrypted-intent',repeat('a',64),repeat('b',64),'signup');
 if not (result->>'queued')::boolean then raise exception 'Request not queued';end if;
 result:=public.rmc_enqueue_auth_email('event-two','replacement-must-not-win',repeat('a',64),repeat('b',64),'signup');
 if not (result->>'duplicate')::boolean or (select count(*) from public.rmc_auth_email_queue)<>1 then raise exception 'Duplicate request queued';end if;
 if (select payload from public.rmc_auth_email_queue)<>'encrypted-intent' then raise exception 'Duplicate replaced original intent';end if;
 if (select expires_at from public.rmc_auth_email_queue)<now()+interval '24 hours' then raise exception 'Quota wait expires queued intent prematurely';end if;
 perform public.rmc_enqueue_auth_email('event-three','encrypted-intent-two',repeat('c',64),repeat('d',64),'recovery');
 update public.rmc_email_delivery_state set sent_count=89,reported_sent=89,baseline_sent=89;
 select * into message from public.rmc_claim_auth_emails();
 if message.id is null then raise exception 'Available quota not used';end if;
 select count(*) into n from public.rmc_claim_auth_emails();
 if n<>0 then raise exception 'In-flight reservation oversubscribed quota';end if;
 if public.rmc_ack_auth_email(message.id,extensions.gen_random_uuid(),true) then raise exception 'Wrong lease accepted';end if;
 -- Simulate Gmail reporting a send before its acknowledgement was recovered.
 perform public.rmc_email_worker_heartbeat(now(),90,null);
 if not public.rmc_ack_auth_email(message.id,message.lease_token,true) then raise exception 'Valid acknowledgement rejected';end if;
 if public.rmc_ack_auth_email(message.id,message.lease_token,true) then raise exception 'Repeated acknowledgement counted twice';end if;
 if (select sent_count from public.rmc_email_delivery_state)<>90 then raise exception 'Sent count not accurate';end if;
 if exists(select 1 from public.rmc_claim_auth_emails()) then raise exception 'Daily cap bypassed';end if;
 update public.rmc_email_delivery_state set window_started=now()-interval '25 hours',reset_at=now()-interval '1 hour';
 update public.rmc_auth_email_queue set sent_at=now()-interval '25 hours' where status='sent';
 perform public.rmc_email_worker_heartbeat(now(),0,null);
 if (select sent_count from public.rmc_email_delivery_state)<>0 then raise exception 'New quota window not reset';end if;
 if not exists(select 1 from public.rmc_claim_auth_emails()) then raise exception 'Queue did not resume after quota reset';end if;
 perform public.rmc_email_worker_heartbeat(now(),0,'quota');
 if exists(select 1 from public.rmc_claim_auth_emails()) then raise exception 'Google quota block ignored';end if;
end $$;
reset role;
select 'Email quota, deduplication, expiry, and superadmin security checks passed' as result;
rollback;
