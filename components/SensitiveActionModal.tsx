import { errorMessage } from '../lib/errors';
import ErrorNotice from './ui/ErrorNotice';
import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import Button from './ui/Button';
import type { SensitiveConfirmation } from '../lib/supabase';

export function SensitiveActionModal({ action, targetName, description, onClose, onConfirm }: {
  action: 'ARCHIVE' | 'DELETE'; targetName: string; description?: string;
  onClose: () => void; onConfirm: (confirmation: SensitiveConfirmation) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [typedAction, setTypedAction] = useState('');
  const [typedName, setTypedName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = password.length > 0 && /^\d{6}$/.test(code) && typedAction === action && typedName === targetName && reason.trim().length >= 3;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError('');
    try { await onConfirm({ password, code, typedAction, typedName, reason: reason.trim() }); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setPassword(''); setCode(''); setBusy(false); }
  };
  const label = action === 'ARCHIVE' ? 'Archive' : 'Delete';
  return <Modal open onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={false} title={`${label}: ${targetName}`} description={description} size="md">
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">Current password<input className="input-field mt-1" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required /></label>
      <label className="block text-sm font-semibold">Google Authenticator code<input className="input-field mt-1" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy} required /></label>
      <p className="text-xs text-slate-500">Use the 6-digit code for this account. Set up Google Authenticator in your profile’s security settings first if it is not enabled.</p>
      <label className="block text-sm font-semibold">Type {action}<input className="input-field mt-1" autoComplete="off" value={typedAction} onChange={e => setTypedAction(e.target.value)} disabled={busy} required /></label>
      <label className="block text-sm font-semibold">Type the exact name: {targetName}<input className="input-field mt-1" autoComplete="off" value={typedName} onChange={e => setTypedName(e.target.value)} disabled={busy} required /></label>
      <label className="block text-sm font-semibold">Reason<textarea className="input-field mt-1" rows={3} minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} required /></label>
      {error && <ErrorNotice error={error} operation="Sensitive Action Modal"></ErrorNotice>}
      <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant={action === 'DELETE' ? 'danger' : 'gold'} disabled={!valid || busy}>{busy ? 'Verifying…' : `Confirm ${label}`}</Button></div>
    </form>
  </Modal>;
}
