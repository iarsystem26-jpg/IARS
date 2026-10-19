import { errorMessage } from '../lib/errors';
import ErrorNotice from './ui/ErrorNotice';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { appAuth } from '../lib/backend';
import Button from './ui/Button';
import { toast } from '../lib/toast';
import { Eye, EyeOff } from 'lucide-react';

export function AuthChallenge({ recovery = false, onComplete }: { recovery?: boolean; onComplete: () => void }) {
  const [value, setValue] = useState('');
  const [factorId, setFactorId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { if (!recovery) void supabase.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp[0]?.id || '')); }, [recovery]);
  return <div className="auth-challenge-background min-h-dvh grid place-items-center p-6"><form className="app-surface relative w-full max-w-md space-y-4 p-6" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = recovery
        ? await toast.result(() => supabase.auth.updateUser({ password: value }), 'Reset password')
        : await toast.result(() => supabase.auth.mfa.challengeAndVerify({ factorId, code: value }), 'Verify identity');
      if (result.error) throw result.error;
      onComplete();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }}>
    <h1 className="text-xl font-bold">{recovery ? 'Set a new password' : 'Two-factor verification'}</h1>
    <label className="block">{recovery ? 'New password (at least 12 characters)' : 'Authenticator code'}<span className="relative mt-2 block"><input className="input-field pr-12" required type={recovery && !showPassword ? 'password' : 'text'} inputMode={recovery ? undefined : 'numeric'} minLength={recovery ? 12 : 6} maxLength={recovery ? 128 : 6} autoComplete={recovery ? 'new-password' : 'one-time-code'} value={value} onChange={e => setValue(e.target.value)} />{recovery && <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => setShowPassword(visible => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}</span></label>
    {error && <ErrorNotice error={error} operation="Auth Challenge"></ErrorNotice>}
    <Button type="submit" disabled={busy || (!recovery && !factorId)}>{busy ? 'Verifying…' : 'Continue'}</Button>
    <Button variant="secondary" onClick={() => void appAuth.signOut()}>Sign out</Button>
  </form></div>;
}
