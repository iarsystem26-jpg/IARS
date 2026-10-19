import { readJson, responseHeaders } from './http.ts';
import { emailHash, validEmail, enqueueIntent } from './emailIntent.ts';
import { EMAIL_SITE } from './authEmail.ts';

export function emailRequestHandler(admin: any, encryption: string) {
  const respond = (body: unknown,status=200) => Response.json(body,{status,headers:responseHeaders});
  return async (req: Request) => {
    if (req.method==='OPTIONS') return new Response(null,{headers:responseHeaders});
    if (req.method!=='POST') return respond({error:'Method not allowed'},405);
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const budget = await admin.rpc('rmc_email_request_budget',{ip_key:await emailHash(ip)});
      if (budget.error) throw budget.error;
      if (budget.data>0) return respond({error:'Too many email requests. Please wait before trying again.',retryAfter:budget.data},429);
      const body = await readJson(req,2048);
      const email = String(body.email || '').trim().toLowerCase();
      if (!validEmail(email) || !['confirmation','recovery'].includes(body.action)) return respond({error:'Enter a valid email address.'},400);
      const lookup = await admin.from('rmc_profiles').select('id,status').eq('profile->>email',email).maybeSingle();
      if (lookup.error) throw lookup.error;
      if (lookup.data && ['active','pending'].includes(lookup.data.status)) {
        const result = await admin.auth.admin.getUserById(lookup.data.id);
        if (result.error) throw result.error;
        if (result.data.user?.email?.toLowerCase()===email && (body.action==='recovery' || !result.data.user.email_confirmed_at)) {
          let custom;
          if (body.action==='confirmation') {
            const settings = await admin.from('rmc_enrollment_confirmation').select('email_kind,email_subject,email_body').eq('id',1).single();
            if (settings.error) throw settings.error;
            if (settings.data.email_kind==='custom') custom=settings.data;
          }
          await enqueueIntent(admin,{kind:'intent',userId:lookup.data.id,email,recipient:email,
            action:body.action==='recovery' ? 'recovery' : 'signup',redirect:`${EMAIL_SITE}/`,
            subject:custom?.email_subject,body:custom?.email_body},crypto.randomUUID(),encryption);
        }
      }
      // Same response for unknown, confirmed, inactive, queued and rate-suppressed addresses.
      return respond({accepted:true,cooldownSeconds:120});
    } catch { return respond({error:'Email requests are temporarily unavailable. Try again later.'},503); }
  };
}
