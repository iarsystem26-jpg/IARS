import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0';
import { enrollmentHandler, sha256 } from '../_shared/enrollment.ts';
import { enqueueIntent } from '../_shared/emailIntent.ts';
import { EMAIL_SITE } from '../_shared/authEmail.ts';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
  return enrollmentHandler(admin, client, async (credential, nonce) => {
    const audience = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!audience) throw new Error('Google sign-in has not been configured by the school.');
    const { payload } = await jwtVerify(credential, keys, { audience, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'], requiredClaims: ['exp', 'sub', 'email', 'nonce'] });
    if (payload.email_verified !== true || typeof payload.email !== 'string' || payload.nonce !== await sha256(nonce)) throw new Error('Google email verification failed. Choose your account again.');
    return payload.email.trim().toLowerCase();
  }, {
    ready: Boolean(Deno.env.get('AUTH_EMAIL_ENCRYPTION_KEY')),
    send: async (email, subject, body, userId) => {
      await enqueueIntent(admin,{kind:'intent',userId,email,recipient:email,action:'signup',subject:subject || undefined,body:body || undefined,redirect:`${EMAIL_SITE}/`},crypto.randomUUID(),Deno.env.get('AUTH_EMAIL_ENCRYPTION_KEY')!);
    },
  })(req);
});
