import { EMAIL_SITE, renderAuthEmail, type AuthEmailMessage } from './authEmail.ts';
import type { EmailIntent } from './emailIntent.ts';

// Build previews from copy, never from a live authentication link or OTP.
export function previewEmailIntent(intent: EmailIntent): AuthEmailMessage {
  const copy = {
    signup: ['Confirm your IARS email address', 'Confirm your email address, then return to enrollment and select Check email confirmation. Your school reviews your application separately.', 'Confirm email address'],
    recovery: ['Reset your IARS password', 'Use this secure link to choose a new IARS password. The link was created just before this email was sent; time spent waiting in the queue does not reduce its lifetime.', 'Reset password'],
    magiclink: ['Your secure IARS sign-in link', 'Use this link to sign in to IARS. Only use it if you requested it.', 'Sign in to IARS'],
    invite: ['You are invited to IARS', 'Your school has invited you to use IARS. Follow this link to accept your invitation.', 'Accept invitation'],
    email_change: ['Confirm your IARS email change', 'Confirm the requested change to your account email address.', 'Confirm email change'],
    reauthentication: ['Verify your IARS account', 'Enter this verification code in IARS to continue your account action.', ''],
  }[intent.action];
  const placeholder = `${EMAIL_SITE}/#email-preview-disabled`;
  const message = renderAuthEmail(intent.recipient, intent.subject || copy[0], intent.body || copy[1], copy[2], intent.action === 'reauthentication' ? undefined : placeholder, intent.action === 'reauthentication' ? '[code hidden]' : undefined);
  return {...message,html:message.html.replaceAll(placeholder,'#'),text:message.text.replaceAll(placeholder,'[authentication link hidden]')};
}

export async function archiveEmailPreview(admin: any, id: string, message: AuthEmailMessage) {
  const { error } = await admin.from('rmc_email_history').update({recipient:message.to,subject:message.subject,preview_html:message.html,preview_text:message.text}).eq('id',id);
  if (error) throw error;
}
