begin;

-- Correct future messages on databases that already applied the inbox migration.
create or replace function app_private.notify_excuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.data->'status' is not distinct from old.data->'status' then return new; end if;
 insert into public.rmc_notifications(user_id,source,title,detail,path)
 values(new.student_id,'excuse:'||new.id||':'||(new.data->>'status'),
  'Excuse letter: '||coalesce(new.data->>'status','pending'),
  coalesce(new.data->>'event_title','Your event')||case when new.data->>'status'='pending' then ' — Submitted and awaiting review.'
   else ' — '||coalesce(nullif(new.data->>'review_notes',''),'Your review has been completed.') end,'/student/records')
 on conflict(user_id,source) do nothing;
 return new;
end $$;

-- Keep this internal trigger unavailable to API callers.
revoke all on function app_private.notify_excuse() from public,anon,authenticated;

-- Repair only the broken separator in existing excuse notification messages.
-- Unicode escapes keep the misdecoded bytes out of the source text.
update public.rmc_notifications
set detail = replace(detail, U&' \00E2\20AC\201D ', ' — ')
where source like 'excuse:%'
 and strpos(detail, U&' \00E2\20AC\201D ') > 0;

commit;
