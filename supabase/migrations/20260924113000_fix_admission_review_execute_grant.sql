-- The public wrapper invokes this private SECURITY DEFINER function. The
-- caller needs EXECUTE on the private function for PostgreSQL to resolve the
-- nested call; the function still performs all authorization checks internally.
grant usage on schema app_private to authenticated;
grant execute on function app_private.review_admission(uuid, text, text, text[]) to authenticated;
