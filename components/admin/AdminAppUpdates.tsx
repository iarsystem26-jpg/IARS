import PasswordInput from '../ui/PasswordInput';
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Surface } from '../ui/Page';
import { supabase, initiateAppRefresh } from '../../lib/supabase';
import ErrorNotice from '../ui/ErrorNotice';
import { RefreshCw, CheckCircle2, WifiOff, TriangleAlert, ArrowRight } from 'lucide-react';

export default function AdminAppUpdates() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  if (profile?.role !== 'admin') return null;
  const close = () => { if (busy) return; setOpen(false); setPassword(''); setCode(''); setTyped(''); setError(''); };
  const begin = async () => {
    setOpen(true); setReady(false); setError(''); setSuccess(false);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setNeedsMfa(data.all.some(factor => factor.status === 'verified')); setReady(true);
    } catch { setError('Unable to check two-factor authentication. Reopen this dialog to retry.'); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !ready || typed !== 'initiate') return;
    setBusy(true); setError('');
    try { await initiateAppRefresh(password, code, typed); setPassword(''); setCode(''); setTyped(''); setOpen(false); setSuccess(true); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to initiate refresh. Try again.'); setPassword(''); setCode(''); }
    finally { setBusy(false); }
  };
  return <Surface className="overflow-hidden">
    <div className="space-y-6 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="operations-icon p-3"><RefreshCw size={22} aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-brand-900 dark:text-white">App Updates</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">New deployments update automatically. Use a manual refresh when everyone needs the latest version now.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="operations-detail p-4">
          <CheckCircle2 size={20} aria-hidden="true" className="mb-2 text-[var(--color-success)]" />
          <h3 className="text-sm font-bold">Saved data stays safe</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Sign-ins and saved offline attendance are preserved.</p>
        </div>
        <div className="operations-detail p-4">
          <WifiOff size={20} aria-hidden="true" className="mb-2 text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-bold">Offline devices catch up</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">They refresh after reconnecting. Logged-out visitors are included too.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 operations-warning p-4">
        <TriangleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-warning-text)]" />
        <div className="text-sm leading-6 text-[var(--color-warning-text)]"><p className="font-bold">Before you refresh</p><p>Publish your deployment first. Unsaved form entries may be lost when browsers refresh.</p></div>
      </div>
      {success && <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-success)]"><CheckCircle2 size={18} aria-hidden="true" />Refresh initiated for all clients.</p>}
    </div>
    <div className="flex flex-col gap-4 operations-action-bar p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
      <div><h3 className="text-sm font-bold">Refresh all connected browsers</h3><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Identity verification is required before initiating a refresh.</p></div>
      <Button fullWidth={false} className="w-full shrink-0 sm:w-auto" onClick={() => void begin()}>Refresh everyone now<ArrowRight size={16} aria-hidden="true" /></Button>
    </div>
    <Modal open={open} onClose={close} closeOnBackdrop={!busy} title="Confirm refresh for everyone" description="Verify your identity before refreshing all connected browsers.">
      <form onSubmit={event => void submit(event)} className="space-y-4">
        <label className="block">Current admin password<PasswordInput toggleLabel="current admin password" autoComplete="current-password" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>
        {needsMfa && <label className="block">Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required disabled={busy} value={code} onChange={event => setCode(event.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>}
        <label className="block">Type initiate to confirm<input autoComplete="off" required disabled={busy} value={typed} onChange={event => setTyped(event.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" /></label>
        {error && <ErrorNotice error={error} operation="Refresh everyone" />}
        <div className="flex gap-3"><Button type="submit" disabled={busy || !ready || !password || typed !== 'initiate' || (needsMfa && !/^\d{6}$/.test(code))}>{busy ? 'Verifying…' : 'Initiate refresh'}</Button><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button></div>
      </form>
    </Modal>
  </Surface>;
}
