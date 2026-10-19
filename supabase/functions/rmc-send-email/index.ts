import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { emailIntents, enqueueIntent } from '../_shared/emailIntent.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  const encryption = Deno.env.get('AUTH_EMAIL_ENCRYPTION_KEY');
  if (!secret || !encryption) return Response.json({ error: { http_code: 503, message: 'Email delivery is not configured.' } }, { status: 503 });
  try {
    const payload = await req.text();
    if (payload.length > 64000) return new Response('Request too large', { status: 413 });
    let event: any;
    try { event = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(payload, Object.fromEntries(req.headers)); }
    catch { return new Response('Invalid webhook signature', { status: 401 }); }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    let custom;
    if (event.email_data?.email_action_type === 'signup') {
      const { data, error } = await admin.from('rmc_enrollment_confirmation').select('email_kind,email_subject,email_body').eq('id',1).single();
      if (error) throw new Error('Email configuration unavailable.');
      if (data.email_kind === 'custom') custom = data;
    }
    const intents = emailIntents(event,custom);
    for (const [index,intent] of intents.entries()) await enqueueIntent(admin,intent,`${req.headers.get('webhook-id')}:${index}`,encryption);
    return Response.json({});
  } catch {
    // Never log the webhook body, recipient, password reset link, or OTP.
    return Response.json({ error: { http_code: 503, message: 'Unable to queue authentication email. Try again later.' } }, { status: 503 });
  }
});
