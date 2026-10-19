import ErrorNotice from './ui/ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Button from './ui/Button';
import { passkeyErrorMessage, passkeyUnavailableReason, signInWithPasskey } from '../lib/passkeys';

export default function PasskeySignIn({ onSuccess, disabled = false }: { onSuccess: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const unavailable = passkeyUnavailableReason();
  const signIn = async () => {
    if (request.current || disabled) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      await signInWithPasskey(controller.signal);
      if (!controller.signal.aborted) onSuccess();
    } catch (cause) {
      if (!controller.signal.aborted) setError(passkeyErrorMessage(cause));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <div className="space-y-2">
    <Button type="button" variant="secondary" className="w-full" disabled={disabled || busy || Boolean(unavailable)} onClick={() => void signIn()}>
      <KeyRound size={18} /> {busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
    </Button>
    {error && <ErrorNotice error={error} operation="Passkey Sign In"></ErrorNotice>}
    <p className="text-xs text-slate-500 dark:text-slate-400">{unavailable || 'Use a passkey you added in My Profile. Your device may ask for your face, fingerprint, PIN, or security key.'}</p>
  </div>;
}
