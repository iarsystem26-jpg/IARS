import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, FileCheck2, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { appData } from '../../lib/backend';
import { Modal } from '../ui/Modal';
import { UnitDeletionHierarchy } from './UnitDeletionHierarchy';
import Button from '../ui/Button';
import ErrorNotice from '../ui/ErrorNotice';
import PasswordInput from '../ui/PasswordInput';
import SearchInput from '../ui/SearchInput';
import CustomSelect from '../ui/CustomSelect';
import { errorMessage } from '../../lib/errors';
import { sensitiveActionRequiresMfa } from '../../lib/supabase';
import { availableUnitDestinations, needsUnitTransfer, type UnitDeletionAccess, type UnitDeletionPreview, type UnitDeletionRecord } from '../../lib/unitDeletion';

type Step = 'verify' | 'review' | 'confirm';
const groups = [{ id: 'all', name: 'All records' }, { id: 'unit', name: 'Academic units' }, { id: 'account', name: 'People' }, { id: 'activity', name: 'Events & schedules' }, { id: 'organization', name: 'Organizations' }];
const groupFor = (record: UnitDeletionRecord) => ['event', 'calendar', 'clearance', 'closure'].includes(record.kind) ? 'activity' : record.kind;
const kindLabel = (record: UnitDeletionRecord) => ({ unit: 'Academic unit', account: 'Account & application', event: 'Event', organization: 'Organization', calendar: 'Calendar schedule', clearance: 'Clearance', closure: 'Closure' })[record.kind];

function VerifyIdentity({ busy, onVerify }: { busy: boolean; onVerify: (password: string, code: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    sensitiveActionRequiresMfa().then(value => { if (active) setRequiresMfa(value); }).catch(caught => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [attempt]);
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    if (busy || requiresMfa === null || !password || (requiresMfa && !/^\d{6}$/.test(code))) return;
    setError('');
    try { await onVerify(password, code); } catch (caught) { setError(errorMessage(caught)); }
    finally { setPassword(''); setCode(''); }
  }}>
    <div className="rounded-2xl border border-gold-300/50 bg-gold-50/60 p-5 dark:bg-gold-500/10">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-900 text-gold-300"><LockKeyhole size={21} /></span>
      <h3 className="font-bold text-brand-900 dark:text-white">Verify before reviewing records</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Confirm your identity to view linked people and choose what to delete or transfer. Nothing changes during this step.</p>
    </div>
    <label className="block text-sm font-semibold">Current password<PasswordInput className="input-field mt-2" toggleLabel="current password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required /></label>
    {requiresMfa === null && !error && <p role="status" className="text-sm text-slate-500">Checking account security…</p>}
    {requiresMfa && <label className="block text-sm font-semibold">Google Authenticator code<input className="input-field mt-2 font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} required /><span className="mt-2 block text-xs font-normal text-slate-500">Enter the six-digit code from your enrolled authenticator.</span></label>}
    {requiresMfa === false && <p className="text-xs text-slate-500">No authenticator is enrolled on this account. Your current password is required.</p>}
    {error && <ErrorNotice error={error} operation="Verify deletion access" />}
    {requiresMfa === null && error && <Button fullWidth={false} variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry security check</Button>}
    <Button type="submit" loading={busy} disabled={requiresMfa === null || !password || (requiresMfa && !/^\d{6}$/.test(code))}><ShieldCheck size={16} />Verify and review records</Button>
  </form>;
}

export function UnitDeletionReview({ nodeId, name, onClose, onDeleted }: { nodeId: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const [step, setStep] = useState<Step>('verify');
  const [preview, setPreview] = useState<UnitDeletionPreview | null>(null);
  const [selected, setSelected] = useState(new Set([`unit:${nodeId}`]));
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [typedAction, setTypedAction] = useState('');
  const [typedName, setTypedName] = useState('');
  const [reason, setReason] = useState('');
  const access = useRef<UnitDeletionAccess | null>(null);
  const mounted = useRef(true);
  const resumeStep = useRef<Step>('review');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void access.current?.close(); access.current = null; };
  }, []);
  const moving = preview?.records.filter(record => needsUnitTransfer(record, selected)) || [];
  const unresolved = moving.filter(record => !availableUnitDestinations(record, preview!).some(node => node.id === transfers[record.key]));
  const valid = Boolean(preview && !unresolved.length);
  const kept = (preview?.records.length || 0) - selected.size - moving.length;
  const actionFor = (record: UnitDeletionRecord) => selected.has(record.key) ? 'delete' : needsUnitTransfer(record, selected) ? 'transfer' : 'keep';
  const unitById = new Map((preview?.records || []).filter(record => record.kind === 'unit').map(record => [record.id, record]));
  const unitPath = (id: string) => {
    const parts: string[] = []; const visited = new Set<string>();
    while (id && id !== nodeId && !visited.has(id)) {
      visited.add(id); const unit = unitById.get(id); if (!unit) break;
      parts.unshift(unit.name); id = unit.nodeIds[0];
    }
    return parts.join(' / ');
  };
  const contextFor = (record: UnitDeletionRecord) => [...new Set(record.nodeIds.map(unitPath).filter(Boolean))].join(' · ');
  const rows = (preview?.records || [])
    .filter(record => group === 'all' || groupFor(record) === group)
    .filter(record => actionFilter === 'all' || (actionFilter === 'protected' ? !record.canDelete : actionFor(record) === actionFilter))
    .filter(record => `${record.name} ${record.detail} ${kindLabel(record)} ${contextFor(record)}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(actionFor(b) === 'transfer') - Number(actionFor(a) === 'transfer')
      || groups.findIndex(item => item.id === groupFor(a)) - groups.findIndex(item => item.id === groupFor(b))
      || `${contextFor(a)} / ${a.name}`.localeCompare(`${contextFor(b)} / ${b.name}`));
  const close = () => { if (!busy) onClose(); };
  const requireVerification = (resume: Step) => {
    resumeStep.current = resume;
    setNotice('Verify again to continue with your saved selections.');
    void access.current?.close(); access.current = null; setStep('verify');
  };
  const loadPreview = (value: UnitDeletionPreview) => {
    if (preview && preview.version !== value.version) {
      setSelected(new Set([`unit:${nodeId}`])); setTransfers({}); resumeStep.current = 'review';
      setNotice('Linked records have changed. Review the updated list and choose your selections again.');
    }
    setPreview(value);
  };
  const reload = async () => {
    if (!access.current || Date.now() >= access.current.expiresAt) { requireVerification('review'); return; }
    setBusy(true); setError('');
    try { loadPreview(await access.current.reload()); } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy || typedAction !== 'DELETE' || typedName !== name || reason.trim().length < 3) return;
    if (!access.current || Date.now() >= access.current.expiresAt) { requireVerification('confirm'); return; }
    setBusy(true); setError('');
    try {
      await access.current.confirm({ typedAction, typedName, reason: reason.trim() }, { version: preview!.version, deleteKeys: [...selected], transfers });
      if (mounted.current) onDeleted();
    } catch (caught) { if (mounted.current) setError(errorMessage(caught)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const steps = [{ id: 'verify', name: 'Verify identity' }, { id: 'review', name: 'Review records' }, { id: 'confirm', name: 'Confirm deletion' }];
  const currentIndex = steps.findIndex(item => item.id === step);
  return <Modal open title="Delete academic unit" description={name} onClose={close} closeOnBackdrop={false} size={step === 'verify' ? 'md' : 'xl'}
    footer={step === 'verify' ? <Button variant="secondary" fullWidth={false} disabled={busy} onClick={close}>Cancel</Button> : <>
      <p className="mr-auto min-w-0 self-center text-xs text-slate-500" role="status">{step === 'review' ? unresolved.length ? `${unresolved.length} transfer destination${unresolved.length === 1 ? '' : 's'} still required` : 'All kept records have a safe destination.' : 'Selected records will be permanently removed.'}</p>
      <Button fullWidth={false} variant="secondary" disabled={busy} onClick={() => step === 'confirm' ? setStep('review') : close()}>{step === 'confirm' ? <><ArrowLeft size={15} />Back to review</> : 'Cancel'}</Button>
      {step === 'review' ? <Button fullWidth={false} disabled={!valid || busy} onClick={() => { setError(''); setStep('confirm'); }}>Review and confirm deletion<ArrowRight size={15} /></Button>
        : <Button fullWidth={false} variant="danger" type="submit" form="confirm-unit-deletion" loading={busy} disabled={!valid || typedAction !== 'DELETE' || typedName !== name || reason.trim().length < 3}><Trash2 size={15} />Confirm Delete</Button>}
    </>}>
    <ol aria-label="Deletion steps" className="mb-6 grid grid-cols-3 gap-2">{steps.map((item, index) => <li key={item.id} aria-current={item.id === step ? 'step' : undefined} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold sm:px-3 ${index === currentIndex ? 'border-gold-400/60 bg-brand-900 text-white' : index < currentIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/20">{index < currentIndex ? <Check size={13} /> : index + 1}</span><span>{item.name}</span></li>)}</ol>
    {notice && <p role="status" className="mb-4 rounded-xl border border-gold-300/50 bg-gold-50 p-3 text-sm text-brand-900 dark:bg-gold-500/10 dark:text-gold-200">{notice}</p>}
    {error && <div className="mb-4"><ErrorNotice error={error} operation="Review unit deletion" /></div>}
    {step === 'verify' ? <VerifyIdentity busy={busy} onVerify={async (password, code) => {
      setBusy(true); setError('');
      try {
        await access.current?.close(); access.current = null;
        const next = await appData.beginUnitDeletion(nodeId, password, code);
        if (!mounted.current) { await next.close(); return; }
        access.current = next; setNotice(''); loadPreview(next.preview); setStep(resumeStep.current);
      } finally { if (mounted.current) setBusy(false); }
    }} /> : preview && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><span className="flex items-center gap-2 font-semibold"><ShieldCheck size={16} />Identity verified · Password and enrolled MFA checked</span><button type="button" disabled={busy} className="min-h-8 underline underline-offset-4" onClick={() => requireVerification(step)}>Verify again</button></div>
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">{[
        { label: 'Delete permanently', value: selected.size, tone: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300', icon: Trash2 },
        { label: 'Transfer safely', value: moving.length, tone: 'border-gold-300/60 bg-gold-50/70 text-brand-900 dark:bg-gold-500/10 dark:text-gold-200', icon: ArrowRight },
        { label: 'Keep in their units', value: kept, tone: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300', icon: FileCheck2 },
      ].map(item => <div key={item.label} className={`rounded-xl border p-3 sm:p-4 ${item.tone}`}><item.icon size={16} className="mb-2" /><p className="text-2xl font-bold">{item.value}</p><p className="mt-1 text-[11px] font-semibold sm:text-xs">{item.label}</p></div>)}</div>
      {step === 'review' ? <div className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="Record groups">{groups.map(item => {
          const count = preview.records.filter(record => record.key !== `unit:${nodeId}` && (item.id === 'all' || groupFor(record) === item.id)).length;
          if (!count && item.id !== 'all') return null;
          return <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${group === item.id ? 'border-brand-900 bg-brand-900 text-white dark:border-gold-400 dark:bg-gold-400 dark:text-brand-950' : 'border-slate-200 bg-white text-slate-600 hover:border-gold-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{item.name}<span className="ml-2 opacity-70">{count}</span></button>;
        })}</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]"><SearchInput ariaLabel="Search linked records" placeholder="Search names, IDs, email or units…" value={search} onChange={setSearch} /><CustomSelect ariaLabel="Filter by action" value={actionFilter} onChange={value => setActionFilter(String(value))} options={[{ value: 'all', label: 'All actions' }, { value: 'delete', label: 'Selected for deletion' }, { value: 'transfer', label: 'Needs transfer' }, { value: 'keep', label: 'Kept in unit' }, { value: 'protected', label: 'Protected records' }]} /></div>
        <div className="flex flex-wrap items-center gap-2"><Button size="sm" fullWidth={false} variant="secondary" disabled={busy} onClick={() => setSelected(new Set(preview.records.filter(record => record.canDelete).map(record => record.key)))}><CheckCheck size={14} />Select all deletable records</Button><Button size="sm" fullWidth={false} variant="secondary" disabled={busy} onClick={() => setSelected(new Set([`unit:${nodeId}`]))}>Keep all linked records</Button><Button size="sm" fullWidth={false} variant="secondary" disabled={busy} onClick={reload}><RefreshCw size={14} />Reload records</Button></div>
        <p className="text-xs leading-5 text-slate-500">Checked records are deleted. Unchecked records are kept; choose a destination when their unit is deleted. People inside a retained unit stay with that unit.</p>
        <UnitDeletionHierarchy key={preview.version} preview={preview} rootId={nodeId} selected={selected} transfers={transfers}
          onSelected={setSelected} onTransfer={(key, destination) => setTransfers(previous => ({ ...previous, [key]: destination }))}
          matchingKeys={new Set(rows.map(record => record.key))} filtered={Boolean(search.trim() || group !== 'all' || actionFilter !== 'all')} busy={busy} />
        <details className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/40"><summary className="cursor-pointer font-semibold text-brand-900 dark:text-slate-200">What happens to accounts and history?</summary><p className="mt-2">Deleting an account also removes its enrollment application and sign-in access. Records with linked history must be kept. Transferred accounts keep their history. A mayor moved to another class becomes a student; a mayor kept with the same class retains the designation.</p></details>
      </div> : <form id="confirm-unit-deletion" onSubmit={submit} className="space-y-4">
        <UnitDeletionHierarchy preview={preview} rootId={nodeId} selected={selected} transfers={transfers} readOnly />
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Type DELETE<input className="input-field mt-2" autoComplete="off" value={typedAction} onChange={event => setTypedAction(event.target.value)} disabled={busy} required /></label><label className="block text-sm font-semibold">Type the exact name: {name}<input className="input-field mt-2" autoComplete="off" value={typedName} onChange={event => setTypedName(event.target.value)} disabled={busy} required /></label></div>
        <label className="block text-sm font-semibold">Reason<textarea className="input-field mt-2" rows={3} minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} required /></label>
      </form>}
    </>}
  </Modal>;
}
