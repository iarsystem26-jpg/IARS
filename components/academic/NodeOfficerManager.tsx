import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { SelectField } from '../ui/SelectField';
import { Collapsible } from '../ui/Collapsible';
import ProfileAvatar from '../ui/ProfileAvatar';
import { FormEvent, useMemo, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Plus, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react';
import { hasPermission, roleLabels } from '../../lib/accessControl';
import { appData } from '../../lib/backend';
import { accountUnits, canProvisionRole, managedAccountRoles, supportsAccountRole } from '../../lib/accountProvisioning';
import { SchoolNode, UserProfile, UserRole } from '../../types';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import AssignedUnitPicker from './AssignedUnitPicker';

const fieldClass = 'mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

export const officerRolesForNode = (node: SchoolNode): UserRole[] =>
  managedAccountRoles.filter(role => supportsAccountRole(node, role.id)).map(role => role.id);

export function NodeOfficerSummary({ node }: { node: SchoolNode }) {
  const officers = typeof appData.getOfficialsForNode === 'function' ? appData.getOfficialsForNode(node.id) : [];
  if (!officers.length) return <span className="mt-3 text-[9px] font-semibold text-slate-400">No officer assigned</span>;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
      {officers.slice(0, 2).map((officer) => <span className="max-w-full truncate rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" key={officer.uid}>{officer.name}</span>)}
      {officers.length > 2 ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">+{officers.length - 2}</span> : null}
    </div>
  );
}

interface Props {
  node: SchoolNode;
  actor: UserProfile;
  canManage: boolean;
  onChanged: () => void;
}

export function NodeOfficerManager({ node, actor, canManage, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingUid, setExistingUid] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savedKey, setSavedKey] = useState<{ nodeId: string; value: string } | null>(null);
  const [enrollmentKeyOpen, setEnrollmentKeyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [success, setSuccess] = useState('');
  const units = accountUnits([node]);
  const mayCreate = canManage && (actor.role === 'admin' || hasPermission(actor.role, 'system.manage_accounts', appData.getCustomRoles(), appData.getCoreRoles()));
  const roleCatalog = managedAccountRoles.filter(role => canProvisionRole(actor.role, role.id)
    && (role.id === 'admin' || units.some(unit => supportsAccountRole(unit, role.id))));
  const allowedRoles = roleCatalog.map(role => role.id);
  const roleName = (role: UserRole) => managedAccountRoles.find(item => item.id === role)?.label || roleLabels[role] || role;
  const initialRole = allowedRoles.find(role => supportsAccountRole(node, role)) || allowedRoles[0] || 'ssg';
  const emptyForm = (role = initialRole) => ({ name: '', email: '', username: '', officialId: '', password: '', position: '', role,
    assignment: units.find(unit => supportsAccountRole(unit, role))?.id || '' });
  const [form, setForm] = useState(() => emptyForm());
  const assignmentUnits = units.filter(unit => supportsAccountRole(unit, form.role));
  const officers = typeof appData.getOfficialsForNode === 'function' ? appData.getOfficialsForNode(node.id) : [];
  const eligibleExisting = useMemo(() => (typeof appData.getOfficialAccounts === 'function' ? appData.getOfficialAccounts() : [])
    .filter((account) => account.uid !== actor.uid && account.role !== 'admin' && officerRolesForNode(node).includes(account.role)
      && (actor.role === 'admin' || !account.official_data?.assignment_node_id || appData.isNodeVisibleTo(actor.uid, account.official_data.assignment_node_id))
      && !officers.some((officer) => officer.uid === account.uid)), [node.id, officers.length, actor.uid, actor.role, open]);
  const filteredEligibleExisting = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return eligibleExisting;
    return eligibleExisting.filter((account) => [account.name, account.student_id, account.username, roleName(account.role)]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [accountSearch, eligibleExisting, roleCatalog]);

  const isSectionNode = ['section', 'block'].includes(node.type) || (typeof appData.isMayorRegisteredForSection === 'function' && appData.isMayorRegisteredForSection(node.id, node.name));
  const hasMayor = typeof appData.isMayorRegisteredForSection === 'function' && appData.isMayorRegisteredForSection(node.id, node.name);
  const secKey = isSectionNode && typeof appData.getSectionSecurityKey === 'function' ? appData.getSectionSecurityKey(node.id, node.name) : undefined;

  if (!allowedRoles.length && !officers.length && !isSectionNode) return null;

  const close = () => {
    if (saving) return;
    setOpen(false);
    setError('');
    setExistingUid('');
    setAccountSearch('');
    setMode('new');
    setShowPassword(false);
    setForm(emptyForm());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      if (!mayCreate) throw new Error('You do not have permission to manage accounts.');
      if (mode === 'existing') {
        if (!existingUid) throw new Error('Select an existing officer.');
        await appData.assignOfficialToNode(actor.uid, existingUid, node.id);
      } else {
        if (!allowedRoles.includes(form.role)) throw new Error('Choose an available account role.');
        const assignment = assignmentUnits.find(unit => unit.id === form.assignment);
        if (form.role !== 'admin' && !assignment) throw new Error('Select a valid assigned unit.');
        await appData.createSchoolOfficial(actor.uid, {
          name: form.name.trim(), email: form.email.trim(), username: form.username.trim(),
          student_id: form.officialId.trim(), role: form.role, account_status: 'active',
          official_data: form.role === 'admin' ? undefined : {
            body: form.role === 'ssg' ? 'SSG' : 'OSSA', position: form.position || roleName(form.role),
            scope: assignment?.name, assignment_node_id: assignment?.id,
          },
          school_data: {
            type: 'College', level: 'Administration', section: assignment?.name || '',
            department: assignment?.name || '', school_id: appData.getSchoolStructure()[0]?.id || '',
          },
        }, form.password);
      }
      setSuccess(mode === 'new' ? `${form.name.trim()} created as ${roleName(form.role)}.` : 'Account assigned.');
      if (mode === 'new' && createAnother) {
        setForm({ ...emptyForm(form.role), assignment: form.assignment });
        setShowPassword(false);
      } else {
        setOpen(false);
        setForm(emptyForm());
        setExistingUid('');
        setAccountSearch('');
      }
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!mayCreate || !deleteTarget) return;
    try {
      await appData.deleteSchoolOfficial(actor.uid, deleteTarget.uid);
      setDeleteTarget(null);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const saveSecurityKey = async () => {
    if (!keyInput.trim()) return;
    const formattedKey = keyInput.trim().toUpperCase();
    if (typeof appData.setSectionSecurityKey === 'function') {
      await appData.setSectionSecurityKey(node.id, formattedKey);
    }
    setSavedKey({ nodeId: node.id, value: formattedKey });
    setKeyInput(''); setEditingKey(false);
    onChanged();
  };

  const clearSecurityKey = async () => {
    if (typeof appData.clearSectionSecurityKey !== 'function') return;
    try {
      await appData.clearSectionSecurityKey(node.id);
      setSavedKey(null);
      setKeyInput('');
      setEditingKey(false);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="flex items-center gap-2 font-bold text-brand-900 dark:text-white"><ShieldCheck size={18} /> Assigned officers</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These accounts can access {node.name} and everything below it, but cannot browse parent units.</p></div>
        {mayCreate && allowedRoles.length ? <Button className="sm:w-auto" onClick={() => { setError(''); setSuccess(''); setMode('new'); setForm(emptyForm()); setOpen(true); }} size="sm"><Plus size={15} /> Assign officer</Button> : null}
      </div>
      {success && !open && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {officers.map((officer) => <article className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900" key={officer.uid}><ProfileAvatar alt="" className="h-10 w-10 rounded-full object-cover" src={officer.photo_url} /><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{officer.name}</h4><p className="truncate text-xs text-slate-500">{roleName(officer.role)}</p></div>{mayCreate ? <button aria-label={`Delete ${officer.name}`} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40" onClick={() => setDeleteTarget(officer)}><Trash2 size={16} /></button> : null}</article>)}
        {!officers.length ? <p className="text-sm text-slate-500">No officer is assigned to this unit.</p> : null}
      </div>

      {isSectionNode && <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
        <button
          aria-controls={`enrollment-key-panel-${node.id}`}
          aria-expanded={enrollmentKeyOpen}
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-amber-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:hover:bg-amber-900/30"
          onClick={() => setEnrollmentKeyOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span className="text-sm font-bold">Section enrollment key</span>
          <ChevronDown aria-hidden="true" className="app-disclosure-chevron shrink-0" size={18} />
        </button>
        <Collapsible id={`enrollment-key-panel-${node.id}`} open={enrollmentKeyOpen} innerClassName="space-y-3 border-t border-amber-200/80 p-4 pt-3 dark:border-amber-900/80">
              <p className="text-xs text-slate-600 dark:text-slate-300">{node.enrollmentKeyRequired ? 'Enrollment requires a saved key. The key is stored securely and cannot be displayed after a refresh; set a new key to rotate it, or clear it to make enrollment open.' : 'Set a key to require it when students apply to this section.'}</p>
              {savedKey?.nodeId === node.id && <p role="status" className="break-all text-sm">New key: <strong>{savedKey.value}</strong>. Keep a copy to share with your students.</p>}
              {node.enrollmentKeyRequired && savedKey?.nodeId !== node.id && <p role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Enrollment key is configured for this section.</p>}
              {(canManage || actor.role === 'mayor') && <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-bold">New enrollment key<input className={`app-control ${fieldClass}`} autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value.toUpperCase())} minLength={8} /></label>
                <Button size="sm" disabled={keyInput.trim().length < 8} onClick={saveSecurityKey}>Save enrollment key</Button>
                {node.enrollmentKeyRequired ? <Button size="sm" variant="secondary" onClick={() => void clearSecurityKey()}>Clear key</Button> : null}
              </div>}
        </Collapsible>
      </div>}

      <Modal open={open} onClose={close} title={`Assign officer to ${node.name}`} description="Create separate accounts for each staff member. Multiple accounts can share the same role and unit." footer={<><Button onClick={close} variant="secondary">Cancel</Button><Button form="assign-node-officer" type="submit" loading={saving}><UserRoundCog size={16} /> {mode === 'new' ? (form.role === 'admin' ? 'Create account' : 'Create and assign') : 'Assign account'}</Button></>}>
        <form className="space-y-4" id="assign-node-officer" onSubmit={submit}>
          <fieldset disabled={saving} className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"><button className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'new' ? 'bg-white text-brand-900 shadow dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`} onClick={() => setMode('new')} type="button">New account</button><button className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'existing' ? 'bg-white text-brand-900 shadow dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`} onClick={() => setMode('existing')} type="button">Existing account</button></div>
          {mode === 'existing' ? <div className="block text-sm font-semibold"><label>Eligible accounts<input aria-label="Search eligible accounts" className={`app-control ${fieldClass}`} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search by name, ID, username, or role" type="search" value={accountSearch} /></label><div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">{filteredEligibleExisting.map((account) => <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${existingUid === account.uid ? 'border-gold-500 bg-gold-50/60 ring-2 ring-gold-500/20 dark:bg-gold-950/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`} key={account.uid}><input checked={existingUid === account.uid} className="sr-only" name="eligible-account" onChange={() => setExistingUid(account.uid)} type="radio" value={account.uid} /><ProfileAvatar alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" src={account.photo_url} /><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900 dark:text-white">{account.name}</span><span className="block truncate text-xs font-normal text-slate-500">ID: {account.student_id || account.uid}</span><span className="block truncate text-xs font-normal text-slate-500">{roleName(account.role)}{account.username ? ` · @${account.username}` : ''}</span></span>{existingUid === account.uid ? <Check className="shrink-0 text-emerald-600" size={18} /> : null}</label>)}{!filteredEligibleExisting.length ? <span className="block rounded-xl bg-slate-50 p-4 text-xs font-normal text-slate-500 dark:bg-slate-900">{eligibleExisting.length ? 'No accounts match your search.' : 'No eligible unassigned accounts are available for this unit.'}</span> : null}</div></div> : <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Full name<input className={`app-control ${fieldClass}`} onChange={(e) => setForm({ ...form, name: e.target.value })} required value={form.name} /></label>
            <label className="text-sm font-semibold">Role<SelectField aria-label="Role" className="mt-1 min-w-0" onChange={(e) => setForm({ ...form, role: e, assignment: units.find(unit => supportsAccountRole(unit, e))?.id || '' })} value={form.role}>{roleCatalog.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</SelectField></label>
            {form.role === 'admin' ? <p className="text-sm text-slate-500 sm:col-span-2">Administrators have system-wide access and appear in Managed accounts.</p> : <div className="sm:col-span-2"><AssignedUnitPicker roots={[node]} value={form.assignment} onChange={assignment => setForm({ ...form, assignment })} /></div>}
            <label className="text-sm font-semibold">Email<input className={`app-control ${fieldClass}`} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" value={form.email} /></label>
            <label className="text-sm font-semibold">Username<input className={`app-control ${fieldClass}`} onChange={(e) => setForm({ ...form, username: e.target.value })} required value={form.username} /></label>
            <label className="text-sm font-semibold">Official ID<input className={`app-control ${fieldClass}`} onChange={(e) => setForm({ ...form, officialId: e.target.value })} required value={form.officialId} /></label>
            <label className="text-sm font-semibold">Position<input className={`app-control ${fieldClass}`} onChange={(e) => setForm({ ...form, position: e.target.value })} value={form.position} /></label>
            <label className="text-sm font-semibold sm:col-span-2">Temporary password<span className="relative mt-1.5 block"><input className={`app-control ${`${fieldClass} pr-11`}`} minLength={12} onChange={(e) => setForm({ ...form, password: e.target.value })} required type={showPassword ? 'text' : 'password'} value={form.password} /><button aria-label={showPassword ? 'Hide temporary password' : 'Show temporary password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          </div>}
          {mode === 'new' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createAnother} onChange={e => setCreateAnother(e.target.checked)} />Create another account with this role and unit</label>}
          {success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
          </fieldset>
          {error ? <ErrorNotice error={error} operation="Node Officer Manager"></ErrorNotice> : null}
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} size="sm" title="Delete officer account" description="This permanently removes sign-in access." footer={<><Button onClick={() => setDeleteTarget(null)} variant="secondary">Cancel</Button><Button onClick={remove} variant="danger"><Trash2 size={16} /> Delete</Button></>}><p className="text-sm text-slate-600 dark:text-slate-300">Delete <strong>{deleteTarget?.name}</strong>?</p></Modal>
    </section>
  );
}
