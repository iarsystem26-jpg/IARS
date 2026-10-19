import { EMAIL_SITE, renderAuthEmail, type AuthEmailMessage } from './authEmail.ts';
import { encryptEmail } from './emailQueue.ts';
import { archiveEmailPreview, previewEmailIntent } from './emailPreview.ts';

export type EmailIntent = {
  kind: 'intent'; userId: string; email: string; recipient: string;
  action: 'signup' | 'recovery' | 'magiclink' | 'invite' | 'reauthentication' | 'email_change';
  redirect: string; subject?: string; body?: string; variant?: 'current' | 'new'; newEmail?: string;
  code?: string; codeValidUntil?: number;
};
export const validEmail = (email: string) => email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
export const emailHash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const safeRedirect = (value?: string) => value === EMAIL_SITE || value?.startsWith(`${EMAIL_SITE}/`) ? value : `${EMAIL_SITE}/`;

export function emailIntents(event: any, custom?: { email_subject: string; email_body: string }): EmailIntent[] {
  const user = event.user, data = event.email_data;
  if (!user?.id || !data || !validEmail(user.email || '')) throw new Error('Invalid authentication email request.');
  const base = {kind:'intent' as const,userId:user.id,email:user.email.toLowerCase(),recipient:user.email.toLowerCase(),action:data.email_action_type,redirect:safeRedirect(data.redirect_to)};
  if (data.email_action_type === 'signup') return [{...base,subject:custom?.email_subject,body:custom?.email_body}];
  if (['recovery','magiclink','invite'].includes(data.email_action_type)) return [base];
  if (data.email_action_type === 'reauthentication') return [{...base,code:data.token,codeValidUntil:Date.now()+60*60*1000}];
  if (data.email_action_type === 'email_change' && validEmail(user.new_email || '')) {
    const updated = {...base,newEmail:user.new_email.toLowerCase()};
    return data.token_hash_new && data.token_hash
      ? [{...updated,variant:'current'},{...updated,variant:'new',recipient:updated.newEmail}]
      : [{...updated,variant:'new',recipient:updated.newEmail}];
  }
  throw new Error('Unsupported authentication email request.');
}

export async function enqueueIntent(admin: any, intent: EmailIntent, eventId: string, encryption: string) {
  const group = `${intent.userId}:${intent.action}:${intent.recipient}`;
  const {data,error} = await admin.rpc('rmc_enqueue_auth_email',{
    event_id:eventId,message_payload:await encryptEmail(intent,encryption),dedupe:await emailHash(group),
    recipient:await emailHash(intent.recipient),action_kind:intent.action,refreshable:intent.action!=='reauthentication',
  });
  if (error || !data?.accepted) throw new Error('Unable to queue email. Please try again later.');
  if (data.queued) {
    const queued = await admin.from('rmc_auth_email_queue').select('id').eq('event_key',eventId).single();
    if (queued.error) throw queued.error;
    await archiveEmailPreview(admin,queued.data.id,previewEmailIntent(intent));
  }
  return data;
}

// No Auth token is created until the Gmail worker is about to send this job.
// A stored, signed user ID prevents generateLink from creating replacement users.
export async function prepareEmailIntent(admin: any, intent: EmailIntent): Promise<AuthEmailMessage | null> {
  const {data,error} = await admin.auth.admin.getUserById(intent.userId);
  const user = data?.user;
  if (error || !user || user.email?.toLowerCase()!==intent.email || user.banned_until && new Date(user.banned_until).getTime()>Date.now()) return null;
  if ((intent.action==='signup' || intent.action==='invite') && user.email_confirmed_at) return null;
  if (intent.action==='reauthentication') {
    if (!intent.codeValidUntil || intent.codeValidUntil<=Date.now() || !/^\d{6}$/.test(intent.code || '')) return null;
    return renderAuthEmail(intent.recipient,'Verify your IARS account','Enter this verification code in IARS to continue your account action.','',undefined,intent.code);
  }
  let type = intent.action==='signup' ? 'magiclink' : intent.action;
  const params: any = {type,email:intent.email,options:{redirectTo:safeRedirect(intent.redirect)}};
  if (intent.action==='email_change') {
    if (!intent.newEmail || user.new_email?.toLowerCase()!==intent.newEmail) return null;
    params.type=intent.variant==='current' ? 'email_change_current' : 'email_change_new';
    params.newEmail=intent.newEmail;
  }
  const generated = await admin.auth.admin.generateLink(params);
  if (generated.error || generated.data?.user?.id!==intent.userId || !generated.data.properties?.action_link) throw new Error('Unable to prepare a fresh authentication link.');
  const copy = {
    signup:['Confirm your IARS email address','Confirm your email address, then return to enrollment and select Check email confirmation. Your school reviews your application separately.','Confirm email address'],
    recovery:['Reset your IARS password','Use this secure link to choose a new IARS password. The link was created just before this email was sent; time spent waiting in the queue does not reduce its lifetime.','Reset password'],
    magiclink:['Your secure IARS sign-in link','Use this link to sign in to IARS. Only use it if you requested it.','Sign in to IARS'],
    invite:['You are invited to IARS','Your school has invited you to use IARS. Follow this link to accept your invitation.','Accept invitation'],
    email_change:['Confirm your IARS email change','Confirm the requested change to your account email address.','Confirm email change'],
  }[intent.action];
  return renderAuthEmail(intent.recipient,intent.subject || copy[0],intent.body || copy[1],copy[2],generated.data.properties.action_link);
}
