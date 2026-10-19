-- The public wrapper needs schema resolution for anonymous RPC calls. The
-- underlying private function remains non-executable by public roles.
grant usage on schema app_private to anon;
alter function public.rmc_lookup_enrollment(text) security definer;
revoke all on function app_private.lookup_enrollment(text) from public, anon, authenticated;
grant execute on function public.rmc_lookup_enrollment(text) to anon, authenticated;
