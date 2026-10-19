import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { supabase, configureEnrollmentConfirmation } from '../../lib/supabase';
import { defaultConfirmationSettings, type EnrollmentConfirmationSettings } from '../../lib/enrollmentConfirmation';
import { Surface } from '../ui/Page';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import ErrorNotice from '../ui/ErrorNotice';
import CustomSelect from '../ui/CustomSelect';
import EmailDeliveryTracker from './EmailDeliveryTracker';
import { ShieldCheck, LockKeyhole, KeyRound, Fingerprint, CheckCircle2, ArrowRight } from 'lucide-react';

export default function AdminEnrollmentConfirmation({children}: {children?: React.ReactNode}) {
  const { profile } = useAuth();
  const [settings, setSettings] = useState(defaultConfirmationSettings);
  const [unlocked, setUnlocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (profile?.role !== 'admin') return null;
  const close = () => { if (!busy) { setOpen(false); setPassword(''); setCode(''); setTyped(''); } };
  const begin = async () => {
    setOpen(true); setReady(false); setError(''); setSaved(false);
    try { const result = await supabase.auth.mfa.listFactors(); if (result.error) throw result.error;
      setNeedsMfa(result.data.all.some(f => f.status === 'verified')); setReady(true);
    } catch { setError('Unable to check two-factor authentication. Reopen this dialog to retry.'); }
  };
  const confirm = async (event: React.FormEvent) => {
    event.preventDefault(); if (!ready || busy || typed !== 'initiate') return;
    setBusy(true); setError('');
    try {
      const result = await configureEnrollmentConfirmation(password, code, typed, unlocked ? { ...settings } : null);
      setSettings(result as EnrollmentConfirmationSettings); setUnlocked(true); setSaved(unlocked);
      setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to update enrollment confirmation.'); }
    finally { setPassword(''); setCode(''); setTyped(''); setBusy(false); }
  };
  return <div className="email-subpage space-y-5">
    <div className="space-y-5">
      <Surface className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="operations-icon p-3"><ShieldCheck size={22} aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-brand-900 dark:text-white">Enrollment email confirmation</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Choose how new students verify their email and customize the confirmation message.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 operations-detail operations-detail--muted p-4">
        <LockKeyhole size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-900 dark:text-gold-300" />
        <div className="text-sm leading-6"><p className="font-bold">Restricted to System Owners / Super Admins</p><p className="text-[var(--color-text-muted)]">Verify your identity before opening the editor and again before saving changes.</p></div>
      </div>
      </Surface>
      {unlocked && <EmailDeliveryTracker />}
      {unlocked && children}
      {!unlocked && <ol className="grid gap-4 sm:grid-cols-3" aria-label="Identity verification requirements">
        {[
          { icon: KeyRound, title: 'Current password', detail: 'Use your admin password.' },
          { icon: Fingerprint, title: 'Two-factor code', detail: 'Required when 2FA is enabled.' },
          { icon: ShieldCheck, title: 'Explicit confirmation', detail: <>Type <code className="rounded bg-[var(--color-selected)] px-1.5 py-0.5 font-semibold text-[var(--color-selected-text)]">initiate</code> to continue.</> },
        ].map(({ icon: Icon, title, detail }, index) => <li key={title} className="operations-detail p-4">
          <div className="mb-3 flex items-center justify-between"><Icon size={20} aria-hidden="true" className="text-[var(--color-text-muted)]" /><span className="text-xs font-bold text-[var(--color-text-subtle)]">0{index + 1}</span></div>
          <h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{detail}</p>
        </li>)}
      </ol>}
    {unlocked && <form className="email-panel space-y-5" onSubmit={event => { event.preventDefault(); void begin(); }}>
      <div className="border-b border-[var(--color-border)] pb-4"><p className="email-eyebrow">Configuration</p><h3 className="text-lg font-bold">Enrollment settings</h3><p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage signup verification and the message students receive.</p></div>
      <CustomSelect label="Signup policy" ariaLabel="Signup policy" value={settings.mode} onChange={value => setSettings({ ...settings, mode: value as EnrollmentConfirmationSettings['mode'] })} options={[
        { value: 'required', label: 'Require email confirmation' },
        { value: 'bypass', label: 'Bypass email confirmation' },
        { value: 'google_only', label: 'Google signup only (email already verified)' },
      ]} />
      <p className="text-sm">This policy applies to new student signups. Google always uses a verified email. Bypass accepts email ownership without a confirmation link.</p>
      <CustomSelect label="Confirmation email" ariaLabel="Confirmation email" value={settings.email_kind} onChange={value => setSettings({ ...settings, email_kind: value as EnrollmentConfirmationSettings['email_kind'] })} options={[
        { value: 'supabase', label: 'Standard IARS email through Gmail' },
        { value: 'custom', label: 'Custom IARS message through Gmail' },
      ]} />
      <p className="text-sm">Authentication links are verified by Supabase and emails are delivered by the school’s Gmail account. Delivery can take a few minutes. Gmail sending limits apply.</p>
      {(['instructions', 'image_url', ...(settings.email_kind === 'custom' ? ['email_subject', 'email_body'] : [])] as Array<keyof EnrollmentConfirmationSettings>).map(key => <label key={key} className="block">{({ instructions: 'Instructions shown during enrollment', image_url: 'Example image URL (optional HTTPS)', email_subject: 'Custom email subject', email_body: 'Custom email message' } as Record<string,string>)[key]}
        {key === 'image_url' || key === 'email_subject' ? <input type={key === 'image_url' ? 'url' : 'text'} maxLength={key === 'image_url' ? 2048 : 200} value={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.value })} className="app-control mt-2 w-full rounded-xl border p-3" /> : <textarea required maxLength={key === 'instructions' ? 4000 : 8000} value={settings[key]} rows={4} onChange={e => setSettings({ ...settings, [key]: e.target.value })} className="app-control mt-2 w-full rounded-xl border p-3" />}</label>)}
      {settings.image_url && <img src={settings.image_url} referrerPolicy="no-referrer" alt="Confirmation email example preview" className="max-h-64 max-w-full rounded-xl" />}
      <p className="text-sm">Both options use the IARS logo, responsive layout, verification button, website button, and legal links. Custom subjects and messages appear inside that layout.</p>
      <Button type="submit" fullWidth={false} className="w-full sm:w-auto">Review and confirm changes<ArrowRight size={16} aria-hidden="true" /></Button>
    </form>}
    {saved && <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-success)]"><CheckCircle2 size={18} aria-hidden="true" />Enrollment confirmation settings saved.</p>}
    </div>
    {!unlocked && <Surface className="flex flex-col gap-4 p-5 sm:p-6">
      <p className="text-xs leading-5 text-[var(--color-text-muted)]">The editor remains locked until verification is complete.</p>
      <Button fullWidth={false} className="w-full self-start sm:w-auto [&>span]:whitespace-normal" onClick={() => void begin()}>Verify identity to configure enrollment<ArrowRight size={16} aria-hidden="true" className="shrink-0" /></Button>
    </Surface>}
    <Modal open={open} onClose={close} closeOnBackdrop={!busy} title={unlocked ? 'Confirm enrollment settings change' : 'Verify Super Admin identity'}>
      <form className="space-y-4" onSubmit={event => void confirm(event)}>
        {unlocked && <p>Save policy: <strong>{settings.mode}</strong>; email: <strong>{settings.email_kind}</strong>. These changes affect new signups immediately.</p>}
        <label className="block">Current password<input required type="password" autoComplete="current-password" disabled={busy} value={password} onChange={e => setPassword(e.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>
        {needsMfa && <label className="block">Authenticator code<input required pattern="[0-9]{6}" autoComplete="one-time-code" inputMode="numeric" disabled={busy} value={code} onChange={e => setCode(e.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>}
        <label className="block">Type initiate to confirm<input required autoComplete="off" disabled={busy} value={typed} onChange={e => setTyped(e.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>
        {error && <ErrorNotice error={error} operation="Enrollment confirmation settings" />}
        <Button type="submit" disabled={busy || !ready || !password || typed !== 'initiate' || (needsMfa && !/^\d{6}$/.test(code))}>{busy ? 'Verifying…' : unlocked ? 'Confirm and save' : 'Confirm and open editor'}</Button>
      </form>
    </Modal>
  </div>;
}
