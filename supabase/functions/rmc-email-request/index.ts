import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { emailRequestHandler } from '../_shared/emailRequest.ts';
Deno.serve((req: Request) => {
  const encryption = Deno.env.get('AUTH_EMAIL_ENCRYPTION_KEY');
  if (!encryption) return Response.json({error:'Email delivery is not configured.'},{status:503});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  return emailRequestHandler(admin,encryption)(req);
});
