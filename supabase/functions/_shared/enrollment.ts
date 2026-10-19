import { readJson, responseHeaders } from './http.ts';
import { rateLimit } from './rateLimit.ts';

export const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
// Clients are injected so the security branches can be tested without live users.
export function enrollmentHandler(admin: any, client: any, verifyGoogle: (credential: string, nonce: string) => Promise<string>, mail?: { ready: boolean; send: (email: string, subject: string, body: string, userId: string) => Promise<void> }) {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: responseHeaders });
  const find = async (email: string) => {
    const { data, error } = await admin.from('rmc_profiles').select('id,status').eq('profile->>email', email).maybeSingle();
    if (error) throw error;
    return data;
  };
  const sessionFor = async (email: string, credential: string, nonce: string, profile: any) => {
    if (!['active', 'pending'].includes(profile.status)) throw new Error('This account is inactive. Contact your school officer.');
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
    if (error || !data.session || data.user.id !== profile.id) throw new Error('Unable to sign in with Google. Check the Google provider setup or contact your school officer.');
    return { email, uid: profile.id, existing: true, session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token }, needsEmailConfirmation: false };
  };
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: responseHeaders });
    if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
    const limited = await rateLimit(admin, req, 'enroll');
    if (limited) return limited;
    try {
      const body = await readJson(req, 32 * 1024);
      const { action, credential, nonce, password, enrollmentKey } = body;
      if (!['google', 'enroll', 'resend'].includes(action)) throw new Error('Invalid enrollment action.');
      const { data: settings, error: settingsError } = await admin.from('rmc_enrollment_confirmation').select('*').eq('id', 1).single();
      if (settingsError || !settings) throw new Error('Enrollment confirmation settings are unavailable. Try again later.');
      const sendCustom = async (email: string, uid: string) => {
        if (!mail?.ready) throw new Error('Custom confirmation email delivery is not configured. Contact your school administrator.');
        await mail.send(email,settings.email_kind==='custom' ? settings.email_subject : '',settings.email_kind==='custom' ? settings.email_body : '',uid);
      };
      if (action === 'resend') {
        const email = String(body.email || '').trim().toLowerCase();
        if (!email || email.length > 254) throw new Error('Enter your enrollment email address.');
        const existing = await find(email);
        if (existing) {
          const result = await admin.auth.admin.getUserById(existing.id);
          if (result.error) throw result.error;
          if (!result.data.user.email_confirmed_at) {
            await sendCustom(email,existing.id);
          }
        }
        return respond({ sent: true });
      }
      const google = typeof credential === 'string';
      if (google && (credential.length > 12000 || typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce))) throw new Error('Choose your Google account again.');
      const email = google ? await verifyGoogle(credential, nonce) : String(body.profile?.email || '').trim().toLowerCase();
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const { error: loginLimit } = await admin.rpc('rmc_login_limit', { identifier_hash: await sha256(email), ip_hash: await sha256(ip) });
      if (loginLimit) return respond({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      if (google) {
        const existing = await find(email);
        if (existing) return respond(await sessionFor(email, credential, nonce, existing));
        // Google verification alone never calls any Supabase Auth creation API.
        if (action === 'google') return respond({ email, needsEnrollment: true });
      } else if (action !== 'enroll') throw new Error('Choose a Google account.');
      if (!google && settings.mode === 'google_only') throw new Error('Enrollment requires a verified Google account. Choose Sign up with Google.');
      if (!google && settings.mode === 'required' && !mail?.ready)
        throw new Error('Custom confirmation email delivery is not configured. Contact your school administrator.');
      if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) throw new Error('Complete the enrollment form.');
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Password must contain between 12 and 1024 characters.');
      const profile = { ...body.profile, email };
      const { data: errors, error: validationError } = await admin.rpc('rmc_validate_enrollment', { person: profile, enrollment_key: enrollmentKey || null, phase: 4 });
      if (validationError) throw validationError;
      if (Object.keys(errors || {}).length) throw new Error(Object.values(errors).join(' '));
      const ticket = crypto.randomUUID();
      const { data: retryAfter, error: cooldownError } = await admin.rpc('rmc_enrollment_reserve', {
        email_hash: await sha256(email), ip_hash: await sha256(ip), ticket_hash: await sha256(ticket),
      });
      if (cooldownError) throw cooldownError;
      if (retryAfter > 0) return respond({ error: `Please wait ${retryAfter} seconds before creating another account.`, retryAfter }, 429);
      const metadata = { profile, enrollment_key: enrollmentKey || null, enrollment_ticket: ticket };
      if (!google) {
        {
          const created = await admin.auth.admin.createUser({ email, password, email_confirm: settings.mode === 'bypass', user_metadata: metadata,
            app_metadata: { enrollment_email_kind: settings.email_kind, enrollment_confirmation_required: settings.mode === 'required' } });
          if (created.error || !created.data.user) throw created.error || new Error('Unable to complete enrollment.');
          if (settings.mode === 'bypass') {
            const login = await client.auth.signInWithPassword({ email, password });
            if (login.error || !login.data.session) throw login.error || new Error('Sign in to continue enrollment.');
            return respond({ uid: created.data.user.id, needsEmailConfirmation: false, session: { access_token: login.data.session.access_token, refresh_token: login.data.session.refresh_token } });
          }
          try {
            await sendCustom(email,created.data.user.id);
          }
          catch { return respond({ uid: created.data.user.id, needsEmailConfirmation: true, deliveryWarning: 'Your application was saved, but the email could not be delivered. Use Resend confirmation email or contact your school administrator.' }); }
          return respond({ uid: created.data.user.id, needsEmailConfirmation: true });
        }
      }
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
      if (created.error || !created.data.user) {
        // Another tab may have completed enrollment first. Never create a replacement.
        const existing = await find(email);
        if (existing) return respond(await sessionFor(email, credential, nonce, existing));
        throw created.error || new Error('Unable to complete enrollment.');
      }
      return respond(await sessionFor(email, credential, nonce, { id: created.data.user.id, status: 'pending' }));
    } catch (error) {
      return respond({ error: (error as { message?: string })?.message || 'Unable to complete enrollment.' }, 400);
    }
  };
}
// Only an origin is used: paths and credentials supplied by a browser are ignored.
function DenoOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return undefined;
  const url = new URL(origin);
  return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.origin : undefined;
}
