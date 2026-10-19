import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { SelectField } from '../ui/SelectField';
import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { appData, subscribeData } from '../../lib/backend';
import { accountUnits, managedAccountRoles as roles, supportsAccountRole } from '../../lib/accountProvisioning';
import { UserProfile } from '../../types';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import AssignedUnitPicker from '../academic/AssignedUnitPicker';
import ManagedPasswordField from '../ui/ManagedPasswordField';
import AccountProfilePanel from './AccountProfilePanel';
import { generatePassword, isValidPassword } from '../../lib/passwordPolicy';

import ManagedAccountsTable, { AccountAccessInfo } from './ManagedAccountsTable';
const emptyForm = { name: '', email: '', username: '', student_id: '', role: 'ossa', password: '', assignment: '' };

export const AdminAccountView: React.FC = () => {
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<Record<string, AccountAccessInfo>>({});
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [, setRevision] = useState(0);
  useEffect(() => subscribeData(() => setRevision(value => value + 1)), []);
  const [createdCredential, setCreatedCredential] = useState('');
  const [message, setMessage] = useState('');
  const accounts = appData.getOfficialAccounts();
  const [saving, setSaving] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [error, setError] = useState('');
  const units = accountUnits(appData.getSchoolStructure()).filter(node => supportsAccountRole(node, form.role));
  const loadAccess = async () => {
    setAccessLoading(true); setAccessError('');
    try { setAccess(await appData.getAccountAccess()); }
    catch (error) { setAccessError(errorMessage(error)); }
    finally { setAccessLoading(false); }
  };
  useEffect(() => { loadAccess(); }, []);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (form.password && !isValidPassword(form.password)) { setError('Please meet all password requirements before creating the account.'); return; }
    setError(''); setMessage(''); setCreatedCredential(''); setSaving(true);
    try {
      const node = form.role === 'admin' ? undefined : units.find(unit => unit.id === form.assignment)?.id;
      if (form.role !== 'admin' && !node) throw new Error('Select a valid assigned unit.');
      const profile = { uid: '', photo_url: '', name: form.name.trim(), email: form.email.trim(), username: form.username.trim(), student_id: form.student_id.trim() || form.username.trim(), role: form.role, account_status: 'active' as const, school_data: { type: 'College' as const, level: '', section: '', academic_assignment: node ? { campusId: node, terminalGroupId: node, nodePathIds: [node] } : undefined }, official_data: form.role === 'admin' ? undefined : { body: form.role.startsWith('ossa') ? 'OSSA' as const : 'SSG' as const, assignment_node_id: node } };
      const initialPassword = form.password || generatePassword();
      await appData.createUser(profile, initialPassword);
      setCreatedCredential(initialPassword); setMessage('Account created. Copy the initial password below and share it securely with the account holder.'); setForm(createAnother ? { ...emptyForm, role: form.role, assignment: form.assignment } : emptyForm); setOpen(createAnother); await loadAccess();
    } catch (error) { setError(errorMessage(error)); } finally { setSaving(false); }
  };
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-brand-900 dark:text-white">Managed accounts</h2><p className="mt-1 text-sm text-slate-500">Create multiple administrators, OSAS staff, and SSG officers. Each person gets their own sign-in account.</p></div><Button className="sm:w-auto" onClick={() => { setForm(emptyForm); setError(''); setMessage(''); setCreatedCredential(''); setOpen(true); }}><Plus size={16} /> Create account</Button></div>
    {message && !open && <div role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-800"><p>{message}</p>{createdCredential && <code className="mt-2 block select-all rounded-lg bg-white px-3 py-2 font-bold dark:bg-slate-950">{createdCredential}</code>}</div>}
    <ManagedAccountsTable accounts={accounts} access={access} loading={accessLoading} accessError={accessError} onRefresh={loadAccess} onSelect={account => setSelected(account)} />
    <Modal open={open} onClose={() => { if (!saving) setOpen(false); }} title="Create managed account" description="Choose a role and either enter an initial password or generate one."><form className="space-y-4" onSubmit={create}><fieldset disabled={saving} className="min-w-0 space-y-4"><div className="grid gap-3 sm:grid-cols-2">{([['Full name','name'],['Email','email'],['Username','username'],['ID number','student_id']] as const).map(([label, key]) => <label key={key} className="text-sm font-semibold">{label}<input required={key !== 'student_id'} type={key === 'email' ? 'email' : 'text'} className="input-field mt-1" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}<label className="text-sm font-semibold">Access role<SelectField aria-label="Access role" className="mt-1 min-w-0" value={form.role} onChange={e => setForm({ ...form, role: e, assignment: '' })}>{roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}</SelectField></label>{form.role !== 'admin' && <div className="sm:col-span-2"><AssignedUnitPicker roots={appData.getSchoolStructure()} value={form.assignment} onChange={assignment => setForm({ ...form, assignment })} /></div>}</div>{form.role === 'admin' && <p className="text-sm text-slate-500">Administrators have system-wide access.</p>}<ManagedPasswordField label="Initial password" value={form.password} onChange={password => setForm({ ...form, password })} optional /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createAnother} onChange={e => setCreateAnother(e.target.checked)} />Create another account with this role and unit</label>{error && <ErrorNotice error={error} operation="Admin Account View"></ErrorNotice>}{message && <div role="status" className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800"><p>{message}</p>{createdCredential && <code className="mt-2 block break-all select-all font-bold">{createdCredential}</code>}</div>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving} disabled={Boolean(form.password) && !isValidPassword(form.password)}><ShieldCheck size={16} /> Create account</Button></div></fieldset></form></Modal>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Account profile" description="Profile details, enrollment applications, and account security.">
      {selected && <AccountProfilePanel key={selected.uid} account={accounts.find(account => account.uid === selected.uid) || selected} access={access[selected.uid]} accessLoading={accessLoading} accessError={accessError} applications={appData.getApplications()} />}
    </Modal>
  </div>;
};
