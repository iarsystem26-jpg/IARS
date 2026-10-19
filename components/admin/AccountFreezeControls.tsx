import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Lock, Unlock, Users, RefreshCw } from 'lucide-react';
import { appData, refreshData } from '../../lib/backend';
import { supabase, verifyPassword, configurationError } from '../../lib/supabase';
import { roleLabels } from '../../lib/accessControl';
import { formatManilaDateTime } from '../../lib/dateTime';
import type { UserProfile } from '../../types';
import { useAuth } from '../AuthContext';
import { Modal } from '../ui/Modal';
import SearchInput from '../ui/SearchInput';
import { SelectField } from '../ui/SelectField';
import Button from '../ui/Button';
import { Collapsible } from '../ui/Collapsible';
import ProfileAvatar from '../ui/ProfileAvatar';

const pageSize = 12;
export default function AccountFreezeControls() {
  const { profile, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const [accounts, setAccounts] = useState<UserProfile[]>(() => appData.getAccountsForFreeze());
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<{ ids: string[]; frozen: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const update = () => {
      const next = appData.getAccountsForFreeze(); setAccounts(next);
      setSelected(ids => ids.filter(id => next.some(account => account.uid === id)));
    };
    window.addEventListener('rmc_data_update', update);
    return () => window.removeEventListener('rmc_data_update', update);
  }, []);
  useEffect(() => setPage(0), [query, role, status]);
  if (profile?.role !== 'admin') return null;

  const roles = [...new Set(accounts.map(account => account.role))].sort();
  const filtered = accounts.filter(account => {
    const text = `${account.name} ${account.username} ${account.email || ''} ${account.student_id}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (role === 'all' || account.role === role)
      && (status === 'all' || Boolean(account.account_freeze?.isFrozen) === (status === 'frozen'));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const allVisibleSelected = visible.length > 0 && visible.every(account => selected.includes(account.uid));
  const toggle = (ids: string[], add: boolean) => {
    const next = add ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id));
    if (next.length > 200) { setError('Select up to 200 accounts per batch.'); return; }
    setSelected(next); setError('');
  };
  const close = () => { if (!saving) { setAction(null); setError(''); } };
  const open = async (ids: string[], frozen: boolean) => {
    setAction({ ids, frozen }); setReason(frozen ? 'Account temporarily paused by administration' : '');
    setPassword(''); setCode(''); setFactor(null); setError(''); setMessage('');
    if (!configurationError) {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) { setError(errorMessage(factors.error)); return; }
      setFactor(factors.data.totp.find(item => item.status === 'verified')?.id || null);
    }
  };
  const confirm = async () => {
    if (!action) return;
    setSaving(true); setError('');
    try {
      if (action.frozen && !reason.trim()) throw new Error('Enter a reason for this account freeze.');
      if (!configurationError) {
        if (!user?.email || !password.trim()) throw new Error('Enter your current password to continue.');
        if (!(await verifyPassword(user.email, password))) throw new Error('Incorrect current password.');
        if (factor) {
          if (!code.trim()) throw new Error('Enter your Google Authenticator code.');
          const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code: code.trim() });
          if (result.error) throw new Error('Invalid or expired Google Authenticator code.');
        }
      }
      await appData.setAccountFreezeStatuses(action.ids, action.frozen, reason.trim());
      setMessage(`${action.ids.length} account${action.ids.length === 1 ? '' : 's'} ${action.frozen ? 'frozen' : 'unfrozen'} successfully.`);
      setSelected(ids => ids.filter(id => !action.ids.includes(id))); setAction(null);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSaving(false); }
  };

  return <section aria-labelledby="account-freeze-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-7">
    <h3 id="account-freeze-title">
      <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}
        className="app-disclosure-trigger flex min-h-11 w-full items-center justify-between gap-3 text-left text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-500">
        <span className="flex min-w-0 items-center gap-2"><Users size={20} aria-hidden="true" className="shrink-0 text-cyan-500" /> Individual account freezes</span>
        <ChevronDown size={20} aria-hidden="true" className="app-disclosure-chevron shrink-0 text-slate-500 dark:text-slate-400" />
      </button>
    </h3>
    <Collapsible id={panelId} open={expanded} innerClassName="space-y-5 pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><p className="min-w-0 max-w-2xl flex-1 basis-64 text-sm leading-6 text-slate-500 dark:text-slate-400">Pause one account or select a batch, across all roles. Account freezes also apply to admins. At least one active admin must remain unfrozen.</p><Button fullWidth={false} variant="secondary" aria-label="Refresh account list" onClick={() => void refreshData().catch(() => setError('Could not refresh accounts. Try again.'))}><RefreshCw size={15} /> Refresh</Button></div>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_220px]"><div className="min-w-0 sm:col-span-2 lg:col-span-1"><SearchInput value={query} onChange={setQuery} ariaLabel="Search accounts to freeze" placeholder="Search name, username, email or ID" /></div><SelectField aria-label="Filter account role" value={role} onChange={setRole}><option value="all">All roles</option>{roles.map(id => <option key={id} value={id}>{roleLabels[id] || id}</option>)}</SelectField><SelectField aria-label="Filter account freeze" value={status} onChange={setStatus}><option value="all">All account freezes</option><option value="frozen">Account frozen</option><option value="active">No account freeze</option></SelectField></div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50"><label className="flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" aria-label="Select visible accounts" checked={allVisibleSelected} disabled={!visible.length || saving} onChange={e => toggle(visible.map(account => account.uid), e.target.checked)} className="h-4 w-4 accent-brand-900" />Select this page</label><span className="text-xs text-slate-500">{selected.length} selected</span><div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto"><Button fullWidth={false} size="sm" variant="danger" disabled={!selected.length || saving} onClick={() => void open([...selected], true)}><Lock size={13} /> Freeze selected</Button><Button fullWidth={false} size="sm" variant="secondary" disabled={!selected.length || saving} onClick={() => void open([...selected], false)}><Unlock size={13} /> Unfreeze selected</Button></div></div>
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>}
    {error && !action && <ErrorNotice error={error} operation="Account Freeze Controls"></ErrorNotice>}
    <div className="divide-y divide-slate-100 dark:divide-slate-700">{visible.length ? visible.map(account => {
      const direct = Boolean(account.account_freeze?.isFrozen);
      const inherited = !direct && appData.isUserScopeFrozen(account);
      return <div key={account.uid} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"><input type="checkbox" aria-label={`Select ${account.name}`} checked={selected.includes(account.uid)} disabled={saving} onChange={e => toggle([account.uid], e.target.checked)} className="mt-2 h-4 w-4 shrink-0 accent-brand-900" /><div className="flex min-w-0 items-start gap-3"><ProfileAvatar src={account.photo_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover dark:border-slate-700 dark:bg-slate-700 sm:h-12 sm:w-12" /><div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{account.name}{account.uid === profile.uid && <span className="ml-1 font-normal text-slate-500">(you)</span>}</p><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{roleLabels[account.role] || account.role}</span></div><p className="mt-1 break-words text-xs text-slate-500">@{account.username} · {account.student_id} · {account.account_status || 'active'}</p><p className={`mt-2 text-xs font-semibold ${direct ? 'text-red-600 dark:text-red-300' : inherited ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{direct ? 'Account frozen' : inherited ? 'School or unit freeze applies' : 'No account freeze'}</p>{direct && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{account.account_freeze?.reason}{account.account_freeze?.frozenAt ? ` · ${formatManilaDateTime(account.account_freeze.frozenAt)}` : ''}</p>}</div></div><Button fullWidth={false} className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1" size="sm" variant={direct ? 'secondary' : 'danger'} disabled={saving} aria-label={`${direct ? 'Unfreeze' : 'Freeze'} ${account.name}`} onClick={() => void open([account.uid], !direct)}>{direct ? <Unlock size={13} /> : <Lock size={13} />}{direct ? 'Unfreeze' : 'Freeze'}</Button></div>;
    }) : <p className="py-6 text-center text-sm text-slate-500">No accounts match these filters.</p>}</div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{filtered.length} accounts · Page {current + 1} of {pages}</span><div className="flex gap-2"><Button fullWidth={false} size="sm" variant="secondary" aria-label="Previous account page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={15} /></Button><Button fullWidth={false} size="sm" variant="secondary" aria-label="Next account page" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={15} /></Button></div></div>
    <p className="text-xs leading-5 text-slate-500">Unfreezing an account leaves any school or unit freeze in place.</p>
    </Collapsible>
    <Modal open={Boolean(action)} onClose={close} title={action?.frozen ? 'Freeze accounts' : 'Unfreeze accounts'} description={`${action?.ids.length || 0} selected account(s). This change applies to account access.`} footer={<div className="flex w-full justify-end gap-2"><Button fullWidth={false} variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button fullWidth={false} variant={action?.frozen ? 'danger' : 'primary'} loading={saving} onClick={() => void confirm()}>Confirm {action?.frozen ? 'freeze' : 'unfreeze'}</Button></div>}>
      <div className="space-y-4"><ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">{action?.ids.map(id => { const account = accounts.find(item => item.uid === id); return <li key={id} className="break-words">{account?.name} <span className="text-xs text-slate-500">({account?.username})</span></li>; })}</ul>
        {action?.frozen && action.ids.includes(profile.uid) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">You selected your own account. Your workspace will be paused after confirmation. Another unfrozen admin must restore your access.</p>}
        <label className="block text-sm font-semibold">Reason<textarea rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className="input-field mt-1" /></label>
        {!configurationError && <label className="block text-sm font-semibold">Current password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field mt-1" /></label>}
        {factor && <label className="block text-sm font-semibold">Google Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} className="input-field mt-1" /></label>}
        {error && <ErrorNotice error={error} operation="Account Freeze Controls"></ErrorNotice>}
      </div>
    </Modal>
  </section>;
}

