export type AuthEmailMessage = { to: string; subject: string; text: string; html: string; logoUrl: string };
export const EMAIL_SITE = 'https://rmcssg.vercel.app';
export const EMAIL_LOGO = `${EMAIL_SITE}/academic-seal-transparent.png`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderAuthEmail(to: string, title: string, body: string, actionLabel: string, actionUrl?: string, code?: string): AuthEmailMessage {
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to) || to.length > 254) throw new Error('Invalid email recipient.');
  if (actionUrl && !actionUrl.startsWith('https://')) throw new Error('Invalid authentication link.');
  const legal = [['privacy-policy', 'Privacy Policy'], ['data-privacy-agreement', 'Data Privacy Act Agreement'], ['terms-of-service', 'Terms of Service'], ['data-deletion', 'Data Deletion']];
  const button = (label: string, url: string, secondary = false) => `<table role="presentation" cellspacing="0" cellpadding="0" class="button-table" style="margin:18px 0;"><tr><td bgcolor="${secondary ? '#edf2f7' : '#062b59'}" style="border-radius:8px;"><a href="${escape(url)}" class="email-button" style="display:inline-block;padding:15px 22px;font-size:16px;font-weight:bold;color:${secondary ? '#062b59' : '#ffffff'};text-decoration:none;border-radius:8px;">${escape(label)}</a></td></tr></table>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title><style>@media only screen and (max-width:600px){.outer{padding:12px 8px!important}.content{padding:22px 18px!important}.heading{font-size:24px!important}.button-table{width:100%!important}.email-button{display:block!important;text-align:center!important}.legal-link{display:block!important;padding:6px 0!important}}</style></head><body style="margin:0;padding:0;background:#f1f5f9;color:#172033;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(title)} — IARS</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9"><tr><td align="center" class="outer" style="padding:32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dbe3ee;border-radius:16px;">
<tr><td class="content" bgcolor="#062b59" style="padding:26px 30px;border-radius:16px 16px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="72" valign="middle"><img src="${EMAIL_LOGO}" width="60" height="60" alt="IARS academic seal" style="display:block;width:60px;height:60px;border:0;"></td><td valign="middle"><p style="margin:0;color:#ffffff;font-size:26px;font-weight:bold;">IARS</p><p style="margin:6px 0 0;color:#f4ca65;font-size:12px;line-height:1.5;">Attendance &amp; Records System</p></td></tr></table></td></tr>
<tr><td class="content" style="padding:30px;"><h1 class="heading" style="margin:0 0 18px;color:#062b59;font-size:28px;line-height:1.3;">${escape(title)}</h1><p style="margin:0;font-size:16px;line-height:1.7;">${escape(body).replace(/\n/g, '<br>')}</p>
${code ? `<p style="margin:22px 0;padding:16px;background:#fff8e5;color:#062b59;font-size:28px;font-weight:bold;letter-spacing:5px;text-align:center;">${escape(code)}</p>` : ''}
${actionUrl ? button(actionLabel, actionUrl) + `<p style="font-size:13px;color:#475569;line-height:1.6;">If the button does not work, copy this link into your browser:</p><p style="font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;"><a href="${escape(actionUrl)}" style="color:#005fc1;">${escape(actionUrl)}</a></p>` : ''}
<p style="margin:24px 0 0;color:#475569;font-size:14px;line-height:1.6;">For your security, do not share this email, link, or code. If you did not request this action, ignore this email. If a link expires, request a new one in IARS.</p>${button('Open IARS website', `${EMAIL_SITE}/`, true)}</td></tr>
<tr><td class="content" bgcolor="#f8fafc" style="padding:24px 30px;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;"><p style="margin:0 0 12px;color:#062b59;font-size:13px;font-weight:bold;">Your privacy and account information</p>${legal.map(([path,label]) => `<a class="legal-link" href="${EMAIL_SITE}/#/${path}" style="display:inline-block;margin-right:14px;margin-bottom:10px;color:#475569;font-size:12px;line-height:1.5;text-decoration:underline;">${label}</a>`).join('')}<p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.6;">IARS · RMC Attendance<br>This is an automated account email. Email verification and school admission approval are separate steps.</p></td></tr></table></td></tr></table></body></html>`;
  return { to, subject: title.replace(/[\r\n]/g, ' ').slice(0, 200), html, logoUrl: EMAIL_LOGO, text: `${title}\n\n${body}\n\n${code ? `Code: ${code}\n` : ''}${actionUrl ? `${actionLabel}: ${actionUrl}\n` : ''}\nOpen IARS website: ${EMAIL_SITE}/\n\n${legal.map(([path,label]) => `${label}: ${EMAIL_SITE}/#/${path}`).join('\n')}\n\nIf you did not request this action, ignore this email. Do not share your link or code.` };
}

export function authEmailMessages(event: any, authUrl: string, custom?: { email_subject: string; email_body: string }): AuthEmailMessage[] {
  const user = event.user, email = event.email_data;
  if (!user || !email) throw new Error('Invalid authentication email event.');
  const link = (hash: string, type: string) => {
    if (!/^[a-zA-Z0-9_-]{16,256}$/.test(hash || '')) throw new Error('Invalid authentication token.');
    const url = new URL('/auth/v1/verify', authUrl);
    url.searchParams.set('token', hash); url.searchParams.set('type', type);
    // Redirects are validated by Auth when requested, then bound to the app here.
    const redirect = String(email.redirect_to || EMAIL_SITE);
    url.searchParams.set('redirect_to', redirect.startsWith(`${EMAIL_SITE}/`) || redirect === EMAIL_SITE ? redirect : EMAIL_SITE);
    return url.href;
  };
  const one = (to: string, title: string, body: string, label: string, hash: string, type: string) => renderAuthEmail(to, title, body, label, link(hash,type));
  switch (email.email_action_type) {
    case 'signup': return [one(user.email, custom?.email_subject || 'Confirm your IARS email address', custom?.email_body || 'Confirm your email address, then return to enrollment and select Check email confirmation. Continue your application and upload the required documents.', 'Confirm email address', email.token_hash, 'signup')];
    case 'recovery': return [one(user.email, 'Reset your IARS password', 'Use the secure button below to choose a new password for your IARS account.', 'Reset password', email.token_hash, 'recovery')];
    case 'magiclink': return [one(user.email, 'Your secure IARS sign-in link', 'Use this link to sign in to IARS. Only use it if you requested it.', 'Sign in to IARS', email.token_hash, 'magiclink')];
    case 'invite': return [one(user.email, 'You are invited to IARS', 'Your school has invited you to use IARS. Follow the link below to accept your invitation.', 'Accept invitation', email.token_hash, 'invite')];
    case 'reauthentication': return [renderAuthEmail(user.email, 'Verify your IARS account', 'Enter this verification code in IARS to continue your account action.', '', undefined, email.token)];
    case 'email_change': {
      if (email.token_hash_new && email.token_hash) return [one(user.email, 'Confirm your IARS email change', 'Confirm the requested change to your account email address.', 'Confirm email change', email.token_hash_new, 'email_change'), one(user.new_email, 'Confirm your new IARS email', 'Confirm this new email address for your IARS account.', 'Confirm new email', email.token_hash, 'email_change')];
      return [one(user.new_email, 'Confirm your new IARS email', 'Confirm this email address for your IARS account.', 'Confirm new email', email.token_hash || email.token_hash_new, 'email_change')];
    }
    default: throw new Error('Unsupported authentication email action.');
  }
}
