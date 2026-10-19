import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { formatManilaDateTime } from '../../lib/dateTime';
import { SelectField } from '../ui/SelectField';
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Lock, RefreshCw, ShieldCheck, Snowflake, Unlock } from 'lucide-react';
import { appData } from '../../lib/backend';
import { SchoolNode, SystemFreezeState, NodeFreezeState } from '../../types';
import SearchInput from '../ui/SearchInput';
import { flattenDirectory } from '../../lib/academicDirectory';
import { Modal } from '../ui/Modal';
import { useAuth } from '../AuthContext';
import { configurationError, supabase, verifyPassword } from '../../lib/supabase';
import AccountFreezeControls from './AccountFreezeControls';

const nodeHasMatch = (node: SchoolNode, query: string): boolean => {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return node.name.toLowerCase().includes(normalized) || Boolean(node.code?.toLowerCase().includes(normalized)) || (node.children || []).some(child => nodeHasMatch(child, query));
};

export const AdminFreezeView: React.FC<{ actorName?: string }> = ({ actorName }) => {
  const { user } = useAuth();
  const [systemFreeze, setSystemFreeze] = useState<SystemFreezeState>(appData.getSystemFreezeStatus());
  const [frozenNodes, setFrozenNodes] = useState<Record<string, NodeFreezeState>>(appData.getFrozenNodes());
  const [structure, setStructure] = useState<SchoolNode[]>(appData.getSchoolStructure());
  const [globalReason, setGlobalReason] = useState('School Account Unpaid - Annual License Renewal Required');
  const [nodeReason, setNodeReason] = useState('Department temporarily suspended by administration');
  const [freezeTarget, setFreezeTarget] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedNode, setSelectedNode] = useState<SchoolNode | null>(null);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState('Freeze applied');
  const [successNodes, setSuccessNodes] = useState<SchoolNode[]>([]);
  const [password, setPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshData = () => {
    setSystemFreeze(appData.getSystemFreezeStatus());
    setFrozenNodes(appData.getFrozenNodes());
    setStructure(appData.getSchoolStructure());
  };
  useEffect(() => {
    refreshData();
    window.addEventListener('rmc_data_update', refreshData);
    return () => window.removeEventListener('rmc_data_update', refreshData);
  }, []);

  const resetAuth = () => { setPassword(''); setAuthCode(''); setAuthError(''); setMfaFactorId(null); setFreezeTarget(''); };
  const openNodeModal = async (node: SchoolNode) => {
    setSelectedNode(node); resetAuth();
    if (!configurationError) {
      const factors = await supabase.auth.mfa.listFactors();
      setMfaFactorId(factors.data?.totp?.find(factor => factor.status === 'verified')?.id || null);
    }
  };
  const openGlobalModal = async () => {
    setShowGlobalModal(true); resetAuth();
    if (!configurationError) {
      const factors = await supabase.auth.mfa.listFactors();
      setMfaFactorId(factors.data?.totp?.find(factor => factor.status === 'verified')?.id || null);
    }
  };
  const closeAuthModal = () => { setSelectedNode(null); setShowGlobalModal(false); resetAuth(); };

  const verifyAction = async () => {
    const expectedTarget = selectedNode?.name || 'Entire school system';
    if (freezeTarget.trim().toLowerCase() !== expectedTarget.trim().toLowerCase()) {
      setAuthError(`Type “${expectedTarget}” exactly to confirm what you are freezing.`);
      return false;
    }
    // Demo/local mode has no Supabase verifier. Production sessions must re-enter credentials.
    if (configurationError) return true;
    if (!user?.email) { setAuthError('Your session has expired. Sign in again before freezing a scope.'); return false; }
    if (!password.trim()) { setAuthError('Enter your current password to continue.'); return false; }
    if (!(await verifyPassword(user.email, password))) { setAuthError('Incorrect current password.'); return false; }
    if (mfaFactorId) {
      if (!authCode.trim()) { setAuthError('Enter the Google Authenticator code to continue.'); return false; }
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) { setAuthError(errorMessage(challenge.error)); return false; }
      const verified = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.data.id, code: authCode.trim() });
      if (verified.error) { setAuthError('Invalid or expired Google Authenticator code.'); return false; }
    }
    return true;
  };

  const descendantsOf = (node: SchoolNode) => flattenDirectory([node]);
  const finishSuccess = (title: string, nodes: SchoolNode[]) => {
    setSuccessTitle(title); setSuccessNodes(nodes); closeAuthModal(); refreshData(); setShowSuccess(true);
  };
  const confirmGlobal = async () => {
    setSaving(true); setAuthError('');
    try {
      if (!(await verifyAction())) return;
      const nextState = !systemFreeze.isFrozen;
      await appData.setSystemFreezeStatus(nextState, nextState ? globalReason : '', actorName || 'System Admin');
      finishSuccess(nextState ? 'System freeze applied' : 'System unfrozen', nextState ? flattenDirectory(structure) : []);
    } finally { setSaving(false); }
  };
  const confirmNode = async () => {
    if (!selectedNode) return;
    setSaving(true); setAuthError('');
    try {
      if (!(await verifyAction())) return;
      const target = selectedNode;
      await appData.setNodeFreezeStatus(target.id, true, nodeReason, actorName || 'System Admin');
      finishSuccess('Scope freeze applied', descendantsOf(target));
    } finally { setSaving(false); }
  };
  const unfreezeNode = async (node: SchoolNode) => {
    await appData.setNodeFreezeStatus(node.id, false, '', actorName || 'System Admin');
    refreshData();
  };

  const renderTree = (nodes: SchoolNode[], depth = 0): React.ReactNode => nodes.filter(node => nodeHasMatch(node, searchQuery)).map(node => {
    const children = node.children || [];
    const isOpen = Boolean(searchQuery) || expanded[node.id];
    const directlyFrozen = Boolean(frozenNodes[node.id]?.isFrozen);
    const inheritedFrozen = !directlyFrozen && appData.isNodeOrParentFrozen(node.id);
    return <div key={node.id} className="space-y-1">
      <div className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${directlyFrozen ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30' : inheritedFrozen ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900/40'}`} style={{ marginLeft: `${depth * 1.25}rem` }}>
        {children.length ? <button type="button" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`} onClick={() => setExpanded(prev => ({ ...prev, [node.id]: !isOpen }))} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</></button> : <span className="w-7 shrink-0" />}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"><Building2 size={18} /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{node.name}</span><span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">{node.type.replace('_', ' ')}</span></div>{directlyFrozen && <p className="mt-0.5 text-[10px] font-semibold text-red-600 dark:text-red-300">Directly frozen</p>}{inheritedFrozen && <p className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">Frozen through parent</p>}</div>
        <button type="button" onClick={() => directlyFrozen ? unfreezeNode(node) : openNodeModal(node)} className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide ${directlyFrozen ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-900/30 dark:text-red-400'}`}>{directlyFrozen ? <><Unlock size={12} /> Unfreeze</> : <><Lock size={12} /> Freeze</>}</button>
      </div>
      {isOpen && children.length ? <div>{renderTree(children, depth + 1)}</div> : null}
    </div>;
  });

  const authFields = <div className="space-y-4">
    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-100"><div className="flex items-center gap-2 font-bold"><ShieldCheck size={15} /> Verify this freeze action</div><p className="mt-1 opacity-80">Re-enter your password before changing access. Child units under a selected parent will be included automatically.</p></div>
    {!configurationError && <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Current password<input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="app-control mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Enter password" /></label>}
    {!configurationError && mfaFactorId && <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Google Authenticator code<input inputMode="numeric" value={authCode} onChange={e => setAuthCode(e.target.value)} className="app-control mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm tracking-[0.35em] dark:border-slate-700 dark:bg-slate-900" placeholder="000000" /></label>}
    {configurationError && <p className="text-xs text-slate-500">Local demo mode: authentication is simulated.</p>}
    {authError && <ErrorNotice error={authError} operation="Admin Freeze View"></ErrorNotice>}
  </div>;

  return <div className="space-y-6 animate-in fade-in duration-fast">
    <AccountFreezeControls />
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white shadow-brand-elevated sm:p-7"><div className="absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" /><div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${systemFreeze.isFrozen ? 'border-red-500/30 bg-red-500/20 text-red-400' : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'}`}><Snowflake className={`h-7 w-7 ${systemFreeze.isFrozen ? 'animate-spin-slow' : ''}`} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold tracking-tight">System &amp; scope freeze</h2><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${systemFreeze.isFrozen ? 'bg-red-500' : 'bg-emerald-500'}`}>{systemFreeze.isFrozen ? 'SYSTEM FROZEN' : 'SYSTEM ACTIVE'}</span></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-300">Freeze access across the school system or lock down specific departments and classes.</p></div></div><button onClick={openGlobalModal} className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide shadow-lg transition lg:w-auto ${systemFreeze.isFrozen ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-600 hover:bg-red-700'}`}>{systemFreeze.isFrozen ? <Unlock size={14} /> : <Lock size={14} />}{systemFreeze.isFrozen ? 'Unfreeze master system' : 'Freeze master system'}</button></div></div>
    {systemFreeze.isFrozen && <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-50 p-4 text-red-900 dark:bg-red-950/40 dark:text-red-200"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" /><div><h4 className="text-xs font-black uppercase tracking-wider">Global system freeze active</h4><p className="mt-1 text-xs font-semibold">Reason: <span className="underline">{systemFreeze.reason}</span></p><p className="mt-0.5 text-[10px] opacity-75">Frozen by {systemFreeze.frozenBy || 'System Admin'} on {systemFreeze.frozenAt ? formatManilaDateTime(systemFreeze.frozenAt) : 'N/A'}.</p></div></div>}
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-7"><div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-700 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="flex items-center gap-2 text-base font-bold uppercase tracking-wider text-slate-900 dark:text-white"><Building2 size={19} className="text-cyan-500" /> Department &amp; class unit scope freeze</h3><p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Open a parent to view more specific units. Freezing a parent includes every child unit.</p></div><div className="flex w-full items-center gap-2 lg:w-auto"><SearchInput className="flex-1" value={searchQuery} onChange={setSearchQuery} ariaLabel="Search department or section" placeholder="Search department or section..." /><button onClick={refreshData} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:hover:text-white" title="Refresh"><RefreshCw size={15} /></button></div></div><div className="max-h-[640px] space-y-1 overflow-y-auto pr-1">{structure.length ? renderTree(structure) : <p className="py-10 text-center text-sm text-slate-500">No academic units found.</p>}</div></div>

    <Modal open={showGlobalModal} onClose={closeAuthModal} title={systemFreeze.isFrozen ? 'Unfreeze master system' : 'Freeze master system'} description={systemFreeze.isFrozen ? 'Restore access across all departments and classes.' : 'This freezes every unit in the school system.'} size="md" footer={<div className="flex w-full justify-end gap-2"><button onClick={closeAuthModal} className="rounded-xl px-4 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button><button disabled={saving} onClick={confirmGlobal} className={`rounded-xl px-4 py-2 text-xs font-bold uppercase text-white ${systemFreeze.isFrozen ? 'bg-emerald-600' : 'bg-red-600'} disabled:opacity-50`}>{saving ? 'Verifying…' : systemFreeze.isFrozen ? 'Confirm unfreeze' : 'Confirm freeze'}</button></div>}><label className="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">What are you freezing?<span className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Type <strong>Entire school system</strong> to confirm this general freeze.</span><input autoFocus value={freezeTarget} onChange={e => setFreezeTarget(e.target.value)} className="app-control mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Entire school system" /></label><label className="mb-5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Reason for freeze<SelectField aria-label="Reason for freeze" value={globalReason} onChange={e => setGlobalReason(e)} className="mt-1 min-w-0"><option>School Account Unpaid - Annual License Renewal Required</option><option>System Under Emergency Administrative Maintenance</option><option>End of Academic Year System Freeze</option></SelectField></label>{authFields}</Modal>
    <Modal open={Boolean(selectedNode)} onClose={closeAuthModal} title="Freeze scope unit" description={selectedNode ? `Freezing ${selectedNode.name} will include all specific units below it.` : undefined} size="md" footer={<div className="flex w-full justify-end gap-2"><button onClick={closeAuthModal} className="rounded-xl px-4 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button><button disabled={saving} onClick={confirmNode} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-50">{saving ? 'Verifying…' : 'Confirm freeze'}</button></div>}><div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50"><p className="text-sm font-bold text-slate-800 dark:text-white">{selectedNode?.name}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{selectedNode?.type.replace('_', ' ')} · descendants included</p></div><label className="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">What are you freezing?<span className="mt-1 block font-normal normal-case tracking-normal text-slate-500">Type the selected unit name exactly: <strong>{selectedNode?.name}</strong></span><input autoFocus value={freezeTarget} onChange={e => setFreezeTarget(e.target.value)} className="app-control mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder={selectedNode?.name} /></label><label className="mb-5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Reason for freeze<textarea value={nodeReason} onChange={e => setNodeReason(e.target.value)} rows={2} className="app-control mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>{authFields}</Modal>
    <Modal open={showSuccess} onClose={() => setShowSuccess(false)} title={successTitle} description="The following scope is now covered by the freeze." size="md" footer={<button onClick={() => setShowSuccess(false)} className="w-full rounded-xl bg-brand-900 px-4 py-2.5 text-xs font-bold uppercase text-white">Done</button>}><div className="space-y-2"><div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 size={18} /> Freeze status updated successfully</div>{successNodes.length ? successNodes.map(node => <div key={node.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><Lock size={14} className="text-red-500" />{node.name}<span className="ml-auto text-[10px] uppercase text-slate-400">{node.type.replace('_', ' ')}</span></div>) : <p className="text-sm text-slate-500">All users can access the system again.</p>}</div></Modal>
  </div>;
};

