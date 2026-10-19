import { errorMessage } from '../lib/errors';
import { useEffect, useRef, useState } from 'react';
import { googleClientId } from '../lib/googleAuth';

type GoogleApi = { accounts: { id: {
  initialize: (options: { client_id: string; nonce: string; use_fedcm_for_prompt: boolean; callback: (result: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
} } };
declare global { interface Window { google?: GoogleApi } }
let script: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!script) script = new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = 'https://accounts.google.com/gsi/client'; element.async = true;
    element.onload = () => resolve(); element.onerror = () => { script = undefined; element.remove(); reject(new Error('Google could not load. Check your connection and reopen this window.')); };
    document.head.appendChild(element);
  });
  return script;
}
export default function GoogleSignIn({ enrollment = false, onCredential, onError }: {
  enrollment?: boolean; onCredential: (credential: string, nonce: string) => Promise<void>; onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCredential, onError }); callbacks.current = { onCredential, onError };
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!googleClientId) return;
    let disposed = false;
    void (async () => {
      await loadGoogle();
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))), b => b.toString(16).padStart(2, '0')).join('');
      if (disposed || !container.current) return;
      window.google!.accounts.id.initialize({ client_id: googleClientId, nonce: hash, use_fedcm_for_prompt: true, callback: result => {
        if (disposed || inFlight.current) return;
        inFlight.current = true; setBusy(true);
        void callbacks.current.onCredential(result.credential, nonce).catch(error => callbacks.current.onError(errorMessage(error))).finally(() => {
          inFlight.current = false; if (!disposed) setBusy(false);
        });
      } });
      window.google!.accounts.id.renderButton(container.current, { type: 'standard', theme: 'outline', size: 'large', text: enrollment ? 'signup_with' : 'signin_with' });
    })().catch(error => { if (!disposed) callbacks.current.onError(errorMessage(error)); });
    return () => { disposed = true; };
  }, [enrollment]);
  return <div className="space-y-2">
    {googleClientId ? <div ref={container} aria-label={enrollment ? 'Sign up with Google' : 'Sign in with Google'} aria-disabled={busy} className={busy ? 'pointer-events-none opacity-60' : ''} /> : <button type="button" disabled className="w-full rounded-xl border p-3 text-sm text-slate-500">Google sign-in awaits setup</button>}
    {busy && <p role="status" className="text-sm">Checking your Google account…</p>}
  </div>;
}
