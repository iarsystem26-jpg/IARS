-- Safe, durable history; authentication payloads continue to be deleted on delivery.
create table public.rmc_email_history (
 id uuid primary key, recipient text, subject text, kind text,
 status text not null, created_at timestamptz not null, sent_at timestamptz,
 available_at timestamptz, leased_until timestamptz, attempts integer not null default 0,
 last_error text, preview_html text, preview_text text
);
alter table public.rmc_email_history enable row level security;
revoke all on public.rmc_email_history from public,anon,authenticated;
grant all on public.rmc_email_history to service_role;
create index email_history_status_created on public.rmc_email_history(status,created_at desc,id);
create index email_history_sent on public.rmc_email_history(sent_at desc,id) where status='sent';

create function app_private.sync_email_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.rmc_email_history(id,kind,status,created_at,sent_at,available_at,leased_until,attempts,last_error)
 values(new.id,new.kind,new.status,new.created_at,new.sent_at,new.available_at,new.leased_until,new.attempts,new.last_error)
 on conflict(id) do update set status=excluded.status,sent_at=excluded.sent_at,available_at=excluded.available_at,
 leased_until=excluded.leased_until,attempts=excluded.attempts,last_error=excluded.last_error;
 return new;
end $$;
revoke all on function app_private.sync_email_history() from public,anon,authenticated;
create trigger archive_email_status after insert or update on public.rmc_auth_email_queue for each row execute function app_private.sync_email_history();
insert into public.rmc_email_history(id,kind,status,created_at,sent_at,available_at,leased_until,attempts,last_error)
select id,kind,status,created_at,sent_at,available_at,leased_until,attempts,last_error from public.rmc_auth_email_queue;

create function app_private.email_history_list(bucket text,query text,action_filter text,status_filter text,days integer,page_number integer,page_size integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not app_private.email_superadmin() then raise exception 'Only Super Admins can view email history.' using errcode='42501'; end if;
 if bucket not in ('sent','queue') or days not in (0,7,30,90) or page_number<1 or page_number>100000 or page_size not in (10,25,50) or length(query)>200 then
 raise exception 'Invalid email history filters.' using errcode='22023'; end if;
 query:=replace(replace(replace(query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
 select count(*) into total from public.rmc_email_history h where
 (case when bucket='sent' then h.status='sent' else h.status<>'sent' end)
 and (days=0 or coalesce(h.sent_at,h.created_at)>=now()-make_interval(days=>days))
 and (action_filter='' or coalesce(h.kind,'other')=action_filter) and (status_filter='' or h.status=status_filter)
 and (query='' or h.recipient ilike '%'||query||'%' or h.subject ilike '%'||query||'%');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_at desc,r.id),'[]'::jsonb) into result from (
 select h.id,h.recipient,h.subject,coalesce(h.kind,'other') kind,h.status,h.created_at,h.sent_at,h.available_at,h.leased_until,h.attempts,h.last_error,
 (h.preview_html is not null) has_preview,coalesce(h.sent_at,h.created_at) sort_at from public.rmc_email_history h where
 (case when bucket='sent' then h.status='sent' else h.status<>'sent' end)
 and (days=0 or coalesce(h.sent_at,h.created_at)>=now()-make_interval(days=>days))
 and (action_filter='' or coalesce(h.kind,'other')=action_filter) and (status_filter='' or h.status=status_filter)
 and (query='' or h.recipient ilike '%'||query||'%' or h.subject ilike '%'||query||'%')
 order by coalesce(h.sent_at,h.created_at) desc,h.id offset (page_number-1)*page_size limit page_size
 ) r;
 return jsonb_build_object('rows',result,'total',total,'server_now',now());
end $$;
create function public.rmc_email_history_list(bucket text default 'sent',query text default '',action_filter text default '',status_filter text default '',days integer default 30,page_number integer default 1,page_size integer default 10)
returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.email_history_list(bucket,query,action_filter,status_filter,days,page_number,page_size); $$;

create function app_private.email_history_preview(message_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.email_superadmin() then raise exception 'Only Super Admins can preview emails.' using errcode='42501'; end if;
 select jsonb_build_object('html',preview_html,'text',preview_text,'subject',subject,'recipient',recipient,'status',status) into result from public.rmc_email_history where id=message_id;
 if result is null then raise exception 'Email history entry not found.' using errcode='P0002'; end if;
 return result;
end $$;
create function public.rmc_email_history_preview(message_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.email_history_preview(message_id); $$;

create function app_private.email_history_analytics(days integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare totals jsonb; daily jsonb; kinds jsonb;
begin
 if not app_private.email_superadmin() then raise exception 'Only Super Admins can view email analytics.' using errcode='42501'; end if;
 if days not in (7,30,90) then raise exception 'Invalid analytics period.'; end if;
 select jsonb_build_object('requested',count(*),'sent',count(*) filter(where status='sent'),
 'waiting',count(*) filter(where status='pending'),'review',count(*) filter(where status='uncertain'),
 'failed',count(*) filter(where status in ('failed','expired')),'cancelled',count(*) filter(where status='cancelled'),
 'retried',count(*) filter(where attempts>1),
 'average_wait_seconds',coalesce(round(avg(extract(epoch from sent_at-created_at)) filter(where status='sent')),0)) into totals
 from public.rmc_email_history where created_at>=date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' -make_interval(days=>days-1);
 select coalesce(jsonb_agg(r order by r.day),'[]'::jsonb) into daily from (
 select to_char(d.day,'YYYY-MM-DD') as "day",count(h.id) sent from generate_series((now() at time zone 'Asia/Manila')::date-(days-1),(now() at time zone 'Asia/Manila')::date,interval '1 day') d(day)
 left join public.rmc_email_history h on h.status='sent' and h.sent_at>=d.day at time zone 'Asia/Manila' and h.sent_at<(d.day+interval '1 day') at time zone 'Asia/Manila'
 group by d.day) r;
 select coalesce(jsonb_agg(r),'[]'::jsonb) into kinds from (select coalesce(kind,'other') kind,count(*) count from public.rmc_email_history where created_at>=now()-make_interval(days=>days) group by kind order by count(*) desc) r;
 return jsonb_build_object('totals',totals,'daily',daily,'kinds',kinds,'server_now',now());
end $$;
create function public.rmc_email_history_analytics(days integer default 30) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.email_history_analytics(days); $$;

revoke all on function app_private.email_history_list(text,text,text,text,integer,integer,integer),app_private.email_history_preview(uuid),app_private.email_history_analytics(integer),public.rmc_email_history_list(text,text,text,text,integer,integer,integer),public.rmc_email_history_preview(uuid),public.rmc_email_history_analytics(integer) from public,anon;
grant execute on function app_private.email_history_list(text,text,text,text,integer,integer,integer),app_private.email_history_preview(uuid),app_private.email_history_analytics(integer),public.rmc_email_history_list(text,text,text,text,integer,integer,integer),public.rmc_email_history_preview(uuid),public.rmc_email_history_analytics(integer) to authenticated;
