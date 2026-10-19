import ErrorNotice from './ui/ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Button from './ui/Button';
import { Surface } from './ui/Page';
import { formatManilaDate } from '../lib/dateTime';
import { listPasskeys, passkeyErrorMessage, passkeyUnavailableReason, registerPasskey, removePasskey, type Passkey } from '../lib/passkeys';

export default function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const unavailable = passkeyUnavailableReason();
  const refresh = async () => {
    const rows = await listPasskeys();
    if (mounted.current) setPasskeys(rows);
  };
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void listPasskeys().then(rows => { if (active) setPasskeys(rows); }).catch(cause => { if (active) setError(passkeyErrorMessage(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; request.current?.abort(); };
  }, []);
  const act = async (operation: (signal: AbortSignal) => Promise<unknown>, success: string) => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      await operation(controller.signal);
      if (!mounted.current) return;
      setNotice(success); setRemoving(null);
      try { await refresh(); }
      catch { if (mounted.current) setError('Your change was saved, but the passkey list could not refresh. Reload this page.'); }
    } catch (cause) {
      if (mounted.current) setError(passkeyErrorMessage(cause));
    } finally {
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return <Surface className="space-y-4 p-4 sm:p-6" aria-label="Passkey settings">
    <h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-slate-100"><KeyRound size={20} /> Passkeys</h3>
    <p className="text-sm text-slate-600 dark:text-slate-300">Sign in using your device’s face recognition, fingerprint, PIN, or security key. Your biometric data stays on your device.</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">Keep access to your password or Google account for recovery. Add passkeys only on devices or password managers you trust.</p>
    {unavailable && <p className="text-sm text-slate-600 dark:text-slate-300">{unavailable}</p>}
    {error && <ErrorNotice error={error} operation="Passkey Settings"></ErrorNotice>}
    {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
    {loading ? <p role="status" className="text-sm">Loading passkeys…</p> : passkeys.length ? <ul className="space-y-3">
      {passkeys.map(passkey => <li key={passkey.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 break-words"><p className="text-sm font-bold">{passkey.friendly_name || 'Passkey'}</p><p className="text-xs text-slate-500 dark:text-slate-400">Added {formatManilaDate(passkey.created_at)}</p></div>
          <Button type="button" size="sm" variant="secondary" disabled={busy} aria-label={`Remove ${passkey.friendly_name || 'passkey'}`} onClick={() => setRemoving(passkey.id)}>Remove</Button>
        </div>
        {removing === passkey.id && <div className="space-y-2">
          <p className="text-sm">Remove this passkey? It will no longer sign you in. Make sure you can use another passkey, your password, or Google.</p>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => void act(() => removePasskey(passkey.id), 'Passkey removed.')}>Confirm removal</Button><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button></div>
        </div>}
      </li>)}
    </ul> : !error && <p className="text-sm">No passkeys added yet.</p>}
    <Button type="button" variant="secondary" disabled={busy || loading || Boolean(unavailable)} onClick={() => void act(registerPasskey, 'Passkey added. You can now use it on the login screen.')}>
      <KeyRound size={16} /> {busy ? 'Updating passkeys…' : 'Add passkey'}
    </Button>
  </Surface>;
}
