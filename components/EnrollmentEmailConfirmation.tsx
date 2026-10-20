import PasswordInput from './ui/PasswordInput';
import { educationalUnit } from '../lib/educationalUnit';
import { runtimeBackend } from '../lib/institutionRuntime';
import { useEffect,useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { appAuth } from '../lib/backend';
import type { EnrollmentConfirmationSettings } from '../lib/enrollmentConfirmation';
import Button from './ui/Button';
import ErrorNotice from './ui/ErrorNotice';

export default function EnrollmentEmailConfirmation({ email, settings, onConfirmed }: { email: string; settings: EnrollmentConfirmationSettings; onConfirmed: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [resendUntil,setResendUntil] = useState(0);
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const check = async () => {
    setBusy(true); setError('');
    // A pending MFA challenge must never downgrade the active browser session.
    const verifier = createClient(runtimeBackend.url, runtimeBackend.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let transferred = false;
    try {
      const current = await supabase.auth.getUser();
      if (current.data.user?.email?.toLowerCase() === email.toLowerCase() && current.data.user.email_confirmed_at) { onConfirmed(); return; }
      const result = await verifier.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.user?.email_confirmed_at || !result.data.session) throw new Error('Confirm your email address using the link in your inbox first.');
      const session = await supabase.auth.setSession(result.data.session);
      if (session.error) throw session.error;
      transferred = true;
      onConfirmed();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to check email confirmation.'); }
    finally { setPassword(''); setBusy(false); if (!transferred) await verifier.auth.signOut({ scope: 'local' }); }
  };
  return <section aria-label="Email verification" className="space-y-4 rounded-xl border border-amber-300 p-5 text-left">
    <h3 className="text-xl font-bold">Confirm your email to complete enrollment</h3>
    <p>Check <strong>{email}</strong> for your confirmation link.</p>
    <p className="text-sm">Your confirmation request is queued. It sends automatically when Gmail’s allowance is available, including after a daily limit resets. A fresh verification link is created just before sending, so waiting in the queue does not use up its lifetime. Check Spam or Junk. Repeated requests do not add duplicate emails.</p>
    <p className="whitespace-pre-line">{settings.instructions}</p>
    {settings.image_url ? <img src={settings.image_url} alt="Example of the enrollment confirmation email" referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded-xl object-contain" /> : <div className="overflow-hidden rounded-xl border bg-white text-slate-900" aria-label="Illustrative IARS confirmation email">
      <div className="flex items-center gap-3 bg-brand-900 p-4 text-white"><img src={educationalUnit.logoUrl} alt="Institution logo" width={48} height={48} /><div><strong>IARS</strong><p className="text-xs text-gold-300">Attendance &amp; Records System</p></div></div>
      <div className="p-5"><p className="text-xs text-slate-500">Illustrative example — your email may look different</p><h4 className="my-3 text-lg font-bold">{settings.email_kind === 'custom' ? settings.email_subject : 'Confirm your IARS email address'}</h4><p className="whitespace-pre-line">{settings.email_kind === 'custom' ? settings.email_body : 'Confirm your email address, then return to enrollment to continue your application.'}</p><span className="mt-4 inline-block rounded-lg bg-brand-900 px-4 py-3 font-bold text-white">Confirm email address</span><p className="mt-5 text-xs text-slate-500">Open IARS website · Privacy Policy · Data Privacy Act Agreement · Terms of Service · Data Deletion</p></div>
    </div>}
    <label className="block">Enrollment password<PasswordInput toggleLabel="enrollment password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check email confirmation'}</Button>
      <Button variant="secondary" disabled={busy || now<resendUntil} onClick={async () => { setBusy(true); setError(''); setSent(false); try { await appAuth.resendConfirmation(email); setSent(true); setResendUntil(Date.now()+120000); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to resend confirmation email.'); } finally { setBusy(false); } }}>{now<resendUntil ? `Resend available in ${Math.ceil((resendUntil-now)/1000)}s` : 'Resend confirmation email'}</Button></div>
    {sent && <p role="status">Request received. If confirmation is needed, one email is queued. You can close this page and return after delivery.</p>}
    {error && <ErrorNotice error={error} operation="Confirm enrollment email" />}
  </section>;
}
