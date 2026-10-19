-- Supabase default privileges can grant anon EXECUTE independently of PUBLIC.
revoke execute on function public.rmc_update_core_role(text, jsonb) from anon;
notify pgrst, 'reload schema';
