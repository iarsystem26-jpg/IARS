import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { loginHandler } from '../_shared/login.ts';

Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
  return loginHandler(admin, client)(req);
});
