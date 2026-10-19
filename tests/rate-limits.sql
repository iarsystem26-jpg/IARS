-- Execute after the migration, inside a transaction that is rolled back.
do $$
declare k text := 'test:' || gen_random_uuid()::text; i integer; retry integer;
begin
  if has_table_privilege('anon','app_private.request_budgets','SELECT') or has_table_privilege('authenticated','app_private.request_budgets','UPDATE') then raise exception 'Public counter access'; end if;
  if has_function_privilege('authenticated','public.rmc_edge_rate_limit(text,text,boolean)','EXECUTE') or has_function_privilege('anon','app_private.consume_budget(text,integer,integer)','EXECUTE') then raise exception 'Counter bypass exposed'; end if;
  for i in 1..3 loop
    if app_private.consume_budget(k,3,60) <> 0 then raise exception 'Blocked below limit'; end if;
  end loop;
  retry := app_private.consume_budget(k,3,60);
  if retry not between 1 and 60 then raise exception 'Limit not enforced'; end if;
  for i in 1..10 loop perform app_private.consume_budget(k,3,60); end loop;
  if (select attempts from app_private.request_budgets where bucket=k) <> 4 then raise exception 'Counter unbounded'; end if;
  update app_private.request_budgets set window_start=now()-interval '61 seconds' where bucket=k;
  if app_private.consume_budget(k,3,60) <> 0 then raise exception 'Window did not expire'; end if;
  if app_private.consume_budget(k||':other',3,60) <> 0 then raise exception 'Buckets not isolated'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',true);
  perform set_config('request.method','POST',true);
  for i in 1..600 loop perform app_private.enforce_request_budget(); end loop;
  begin
    perform app_private.enforce_request_budget();
    raise exception 'API budget bypassed';
  exception when sqlstate 'PGRST' then null; end;
  -- Even after exhaustion, normal reads remain possible.
  perform set_config('request.method','GET',true);
  perform app_private.enforce_request_budget();
end $$;
