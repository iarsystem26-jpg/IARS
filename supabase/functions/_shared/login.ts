import { readJson, responseHeaders as cors } from './http.ts';
import { rateLimit } from './rateLimit.ts';

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

export function loginHandler(admin: any, client: any) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
    const limited = await rateLimit(admin, req, 'login');
    if (limited) return limited;
    try {
      const { identifier, password } = await readJson(req, 16 * 1024);
      if (typeof identifier !== 'string' || typeof password !== 'string' || identifier.length > 254 || password.length > 1024) throw new Error('Invalid credentials');
      const normalized = identifier.trim().toLowerCase();
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
      const { error: rateError } = await admin.rpc('rmc_login_limit', { identifier_hash: await hash(normalized), ip_hash: await hash(ip) });
      if (rateError) return respond({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429);
      let email = normalized;
      if (!normalized.includes('@')) {
        const { data, error } = await admin.from('rmc_profiles').select('profile').eq('profile->>username', normalized).maybeSingle();
        if (error) throw error;
        email = data?.profile.email || 'nonexistent@invalid.example';
      }
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      // Only a rejected credential attempt can trigger the account lookup.
      // Outages, confirmation errors, and rate limits must not suggest signup.
      if (error?.code === 'invalid_credentials' && normalized.includes('@')) {
        const { data: existing, error: lookupError } = await admin.from('rmc_profiles').select('id').eq('profile->>email', email).maybeSingle();
        if (lookupError) throw lookupError;
        if (!existing) return respond({ error: 'Account not found. Sign up with this email to create your account.', code: 'ACCOUNT_NOT_FOUND' }, 401);
      }
      if (error) throw error;
      if (!data.session) throw new Error('Invalid credentials');
      const { data: profile } = await admin.from('rmc_profiles').select('status').eq('id', data.user.id).single();
      if (!profile || !['pending', 'active'].includes(profile.status)) throw new Error('Invalid credentials');
      return respond({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/email not confirmed|email.*confirm|not verified/i.test(message)) {
        return respond({ error: 'Confirm your email address before signing in. Use the resend confirmation option.' }, 401);
      }
      return respond({ error: 'Unable to sign in. Check your credentials and email verification.' }, 401);
    }
  };
}
