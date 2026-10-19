-- Roll back every test write; never modify the current public documents.
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.rmc_legal_pages) <> 4 then raise exception 'Public read failed'; end if;
  begin
    update public.rmc_legal_pages set title = 'Denied' where kind = 'privacy';
    raise exception 'Anonymous update allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true)
from public.rmc_profiles where role_id = 'student' and status = 'active' limit 1;
set local role authenticated;
do $$
declare changed integer;
begin
  update public.rmc_legal_pages set title = 'Denied' where kind = 'privacy';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student update allowed'; end if;
  begin
    delete from public.rmc_legal_pages where kind = 'privacy';
    raise exception 'Deletion allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.rmc_legal_pages (kind,title,summary,sections) values ('privacy','Denied','Denied','[]');
    raise exception 'Insertion allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true)
from public.rmc_profiles where role_id = 'admin' and status = 'active' limit 1;
set local role authenticated;
do $$
declare previous_version timestamptz; next_version timestamptz; changed integer; rejected boolean := false;
begin
  if (select role_id from app_private.actor()) is distinct from 'admin' then raise exception 'Admin test actor unavailable'; end if;
  select updated_at into previous_version from public.rmc_legal_pages where kind = 'privacy';
  update public.rmc_legal_pages set title = 'Test saved title' where kind = 'privacy' and updated_at = previous_version;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Admin save failed'; end if;
  select updated_at into next_version from public.rmc_legal_pages where kind = 'privacy';
  if next_version = previous_version then raise exception 'Save timestamp did not change'; end if;
  update public.rmc_legal_pages set title = 'Stale edit' where kind = 'privacy' and updated_at = previous_version;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale save overwrote changes'; end if;
  begin
    update public.rmc_legal_pages set sections = '[{"heading":"Empty"}]' where kind = 'privacy';
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Invalid content was accepted'; end if;
end;
$$;
reset role;
rollback;
select 'Legal page access, admin save, timestamp, validation, and conflict checks passed; all writes rolled back.' as result;
