-- Activity owners configure a grace period; legacy activities default to 3 days.
create function app_private.validate_excuse_window() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.data ? 'excuseWindowDays' then
  if jsonb_typeof(new.data->'excuseWindowDays') is distinct from 'number' then
   raise exception 'Excuse submission days must be a whole number from 0 to 30.';
  end if;
  if (new.data->>'excuseWindowDays')::numeric not between 0 and 30
    or trunc((new.data->>'excuseWindowDays')::numeric)<>(new.data->>'excuseWindowDays')::numeric then
   raise exception 'Excuse submission days must be a whole number from 0 to 30.';
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.validate_excuse_window() from public,anon,authenticated;
create trigger validate_excuse_window before insert or update on public.rmc_events
for each row execute function app_private.validate_excuse_window();

-- Validate inside the database so browser clocks and direct RPC calls cannot bypass it.
-- Apply only to new submissions; OSSA can review timely and legacy requests later.
create function app_private.validate_excuse_submission() returns trigger
language plpgsql security invoker set search_path='' as $$
declare e public.rmc_events; deadline timestamptz; proof text;
begin
 select * into strict e from public.rmc_events where id=new.event_id for share;
 if e.data->>'isGeneralEvent'='true' or nullif(e.data->>'cancellationStatus','') is not null
   or coalesce(e.data->>'kind','attendance') in ('service','merit') then
  raise exception 'Excuses are unavailable for this activity.';
 end if;
 if e.data->>'status' in ('pending','rejected') or e.data->>'approvalStatus' in ('pending','rejected') then
  raise exception 'This activity has not been approved.';
 end if;
 deadline:=e.end_at + make_interval(days=>coalesce((e.data->>'excuseWindowDays')::int,3));
 if clock_timestamp()>deadline then
  raise exception 'The excuse submission window has closed. Contact OSSA for exceptional cases.';
 end if;
 if coalesce(length(trim(new.data->>'reason')),0)<10 then
  raise exception 'Enter at least 10 characters of explanation.';
 end if;
 proof:=nullif(new.data->>'proof_url','');
 if proof is null or proof not like 'storage://' || new.student_id::text || '/excuses/%' then
  raise exception 'Attach an excuse letter or supporting document uploaded to your account.';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='rmc-documents' and name=substr(proof,11)) then
  raise exception 'The supporting document could not be found. Upload it again.';
 end if;
 -- Serialize submissions for one student/activity and retain the unique index as a backstop.
 perform pg_advisory_xact_lock(hashtextextended(new.student_id::text || ':' || new.event_id::text,0));
 if exists(select 1 from public.rmc_excuses where student_id=new.student_id and event_id=new.event_id and data->>'status' in ('pending','approved')) then
  raise exception 'You already have a pending or approved excuse for this activity.';
 end if;
 new.data:=new.data||jsonb_build_object('submission_deadline',extract(epoch from deadline)*1000,'submission_date',extract(epoch from clock_timestamp())*1000);
 return new;
end $$;
revoke all on function app_private.validate_excuse_submission() from public,anon,authenticated;
create trigger validate_excuse_submission before insert on public.rmc_excuses
for each row execute function app_private.validate_excuse_submission();
