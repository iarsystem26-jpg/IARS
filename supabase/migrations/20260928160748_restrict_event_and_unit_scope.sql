-- The command gateway already scopes directory writes and sets event ownership
-- from the actor's assignment. Reject explicitly targeted recipients beyond it.
create or replace function app_private.enforce_event_recipient_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 a public.rmc_profiles := app_private.actor();
 audience jsonb := new.data->'audienceTarget';
 recipient text;
begin
 -- Scheduled maintenance has no actor; its updates do not select recipients.
 if a.id is null or a.role_id='admin' then return new; end if;
 if a.node_id is null or new.node_id is null or not app_private.in_scope(new.node_id) then
  raise exception 'This event is outside your assigned unit.' using errcode='42501';
 end if;
 -- Allow closing existing records without revalidating legacy audience labels.
 if tg_op='UPDATE' and new.data->'audienceTarget' is not distinct from old.data->'audienceTarget'
   and new.data->'recipientGroups' is not distinct from old.data->'recipientGroups'
   and new.data->'specificParticipants' is not distinct from old.data->'specificParticipants'
   and new.node_id is not distinct from old.node_id then return new; end if;
 if audience->>'mode'='directory_node' and not app_private.in_scope(audience->>'nodeId') then
  raise exception 'Select recipients only within your assigned unit.' using errcode='42501';
 end if;
 for recipient in select jsonb_array_elements_text(coalesce(audience->'groups',new.data->'recipientGroups','[]')) loop
  if left(recipient,5)='node:' and not app_private.in_scope(substring(recipient from 6)) then
   raise exception 'Select recipients only within your assigned unit.' using errcode='42501';
  end if;
  if left(recipient,7)='person:' and not exists(
   select 1 from public.rmc_profiles p where p.id::text=substring(recipient from 8) and app_private.in_scope(p.node_id)
  ) then raise exception 'Select people only within your assigned unit.' using errcode='42501'; end if;
 end loop;
 for recipient in select jsonb_array_elements_text(coalesce(audience->'specificUserIds',new.data->'specificParticipants','[]')) loop
  if not exists(select 1 from public.rmc_profiles p where p.id::text=recipient and app_private.in_scope(p.node_id)) then
   raise exception 'Select people only within your assigned unit.' using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
revoke all on function app_private.enforce_event_recipient_scope() from public,anon,authenticated;
create trigger enforce_event_recipient_scope
before insert or update of data,node_id on public.rmc_events
for each row execute function app_private.enforce_event_recipient_scope();
