begin;
set local role anon;
do $$ begin
 begin perform public.rmc_claim_auth_emails(); raise exception 'Anonymous queue claim allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.rmc_auth_email_queue; raise exception 'Anonymous queue read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.rmc_claim_auth_emails(); raise exception 'Authenticated queue claim allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.rmc_auth_email_queue(event_key,payload) values('unauthorized','test'); raise exception 'Authenticated mail insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare message public.rmc_auth_email_queue; before_count integer; begin
 insert into public.rmc_auth_email_queue(event_key,payload) values('transactional-test:' || extensions.gen_random_uuid(),'encrypted-test-payload');
 select * into message from public.rmc_claim_auth_emails() where payload = 'encrypted-test-payload' limit 1;
 if message.id is null or message.attempts <> 1 or message.lease_token is null then raise exception 'Queue claim failed'; end if;
 if public.rmc_ack_auth_email(message.id,extensions.gen_random_uuid(),true) then raise exception 'Wrong lease accepted'; end if;
 if not public.rmc_ack_auth_email(message.id,message.lease_token,true) then raise exception 'Queue ack failed'; end if;
 if exists(select 1 from public.rmc_auth_email_queue where id = message.id and (payload <> '' or status <> 'sent')) then raise exception 'Sensitive payload retained after send'; end if;
end $$;
reset role;
select 'GAS email queue security checks passed' as result;
rollback;
