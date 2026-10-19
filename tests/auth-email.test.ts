import { expect, it } from 'vitest';
import { authEmailMessages, renderAuthEmail } from '../supabase/functions/_shared/authEmail';
import { encryptEmail, decryptEmail } from '../supabase/functions/_shared/emailQueue';
const email = { email_action_type: 'signup', token_hash: 'a'.repeat(64), redirect_to: 'https://rmcssg.vercel.app/#/register' };
const event = { user: { email: 'student@example.test', new_email: 'new@example.test' }, email_data: email };
it('renders a responsive layout with seal, legal links, website button and plain-text fallback', () => {
 const result = authEmailMessages(event,'https://project.supabase.co')[0];
 expect(result.html).toContain('max-width:600px'); expect(result.html).toContain('academic-seal-transparent.png');
 for (const path of ['privacy-policy','data-privacy-agreement','terms-of-service','data-deletion']) expect(result.html).toContain(`/#/${path}`);
 expect(result.html).toContain('Open IARS website'); expect(result.text).toContain('Confirm email address: https://project.supabase.co/auth/v1/verify');
});
it('escapes custom subjects and bodies instead of injecting HTML', () => {
 const result = authEmailMessages(event,'https://project.supabase.co',{ email_subject: '<img src=x>',email_body: '<script>alert(1)</script>\nDetails' })[0];
 expect(result.html).not.toContain('<script>'); expect(result.html).toContain('&lt;script&gt;'); expect(result.html).toContain('<br>Details');
});
it.each(['signup','recovery','magiclink','invite','reauthentication','email_change'])('supports %s emails', action => {
 const messages = authEmailMessages({ ...event,email_data: { ...email,email_action_type: action,token: '123456' } },'https://project.supabase.co');
 expect(messages[0].to).toBe(action === 'email_change' ? 'new@example.test' : 'student@example.test');
});
it('uses the documented hash mapping for secure email changes', () => {
 const messages = authEmailMessages({ ...event,email_data: { ...email,email_action_type: 'email_change',token_hash: 'b'.repeat(64),token_hash_new: 'c'.repeat(64) } },'https://project.supabase.co');
 expect(messages).toHaveLength(2); expect(messages[0].to).toBe('student@example.test'); expect(messages[0].text).toContain('token=' + 'c'.repeat(64));
 expect(messages[1].to).toBe('new@example.test'); expect(messages[1].text).toContain('token=' + 'b'.repeat(64));
});
it('binds links to the app rather than an untrusted redirect origin', () => {
 const message = authEmailMessages({ ...event,email_data: { ...email,redirect_to: 'https://rmcssg.vercel.app.evil.test' } },'https://project.supabase.co')[0];
 expect(message.text).not.toContain('evil.test');
});
it('rejects injected recipient lists and non-HTTPS links', () => {
 expect(() => renderAuthEmail('one@test.com,two@test.com','Title','Body','Button','https://test.com')).toThrow();
 expect(() => renderAuthEmail('one@test.com','Title','Body','Button','javascript:alert(1)')).toThrow();
});
it('encrypts recipients and verification tokens and rejects tampering', async () => {
 const key = Buffer.alloc(32,7).toString('base64');
 const message = authEmailMessages(event,'https://project.supabase.co')[0];
 const encrypted = await encryptEmail(message,key);
 expect(encrypted).not.toContain(message.to); expect(encrypted).not.toContain(email.token_hash);
 expect(await decryptEmail(encrypted,key)).toEqual(message);
 await expect(decryptEmail(encrypted,Buffer.alloc(32,8).toString('base64'))).rejects.toThrow();
});
