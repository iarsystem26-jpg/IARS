-- Offline absence replacement can remove a charge without inserting a deduction.
-- Observe both authoritative ledger paths; deletion of a credit can revoke clearance.
create or replace function app_private.track_clearance() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.rmc_profiles; balance numeric; change numeric; student uuid; stamp timestamptz:=clock_timestamp();
begin
 if tg_op='DELETE' then student:=old.student_id; change:=-(old.data->>'change')::numeric;
 else student:=new.student_id; change:=(new.data->>'change')::numeric; end if;
 select * into strict p from public.rmc_profiles where id=student for update;
 balance:=app_private.balance(p.id);
 if balance>0 then
  delete from app_private.clearance_qualifications where student_id=p.id;
  update app_private.clearance_certificates set revoked_at=stamp where student_id=p.id and revoked_at is null;
 elsif change<0 and balance-change>0 and p.role_id in ('student','mayor','ssg') then
  insert into app_private.clearance_qualifications(schedule_id,student_id,cleared_at)
  select s.id,p.id,stamp from app_private.clearance_schedules s
  where stamp>=s.starts_at and stamp<=s.ends_at and s.node_id=any(app_private.path(p.node_id))
  on conflict(schedule_id,student_id) do update set cleared_at=excluded.cleared_at;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function app_private.track_clearance() from public,anon,authenticated;
drop trigger rmc_track_clearance on public.rmc_sanctions;
create trigger rmc_track_clearance after insert or delete on public.rmc_sanctions for each row execute function app_private.track_clearance();
