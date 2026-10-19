import { useState, useSyncExternalStore } from 'react';
import { appData, subscribeData } from '../../lib/backend';
import { useAuth } from '../AuthContext';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';
import ErrorNotice from '../ui/ErrorNotice';

export function RoleAssignment() {
  const { profile } = useAuth();
  const [uid, setUid] = useState('');
  const [roleId, setRoleId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const accounts = [...appData.getOfficialAccounts(), ...appData.getAllStudents()].filter((account, index, all) => all.findIndex(item => item.uid === account.uid) === index);
  const coreRoles = useSyncExternalStore(subscribeData, appData.getCoreRoles);
  const customRoles = useSyncExternalStore(subscribeData, appData.getCustomRoles);
  const roles = [...Object.values(coreRoles), ...Object.values(customRoles)].filter(role => role.id !== 'admin');
  return <form className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" onSubmit={async event => {
    event.preventDefault();
    setError(null); setMessage('');
    try { await appData.assignAccountRole(profile!.uid, uid, roleId); setMessage('Assignment saved. Position-only roles preserve the existing access role.'); }
    catch (error) { setError(error); }
  }}>
    <h2 className="mb-3 font-bold text-brand-900 dark:text-white">Assign access role or position</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <CustomSelect label="Account" ariaLabel="Account" options={accounts.filter(account => account.role !== 'admin').map(account => ({ value: account.uid, label: account.name }))} placeholder="Select account" searchable value={uid} onChange={value => setUid(String(value))} />
      <CustomSelect label="Role or position" ariaLabel="Role or position" options={roles.map(role => ({ value: role.id, label: `${role.name}${role.isPositionOnly ? ' (position)' : ''}` }))} placeholder="Select role" value={roleId} onChange={value => setRoleId(String(value))} />
      <Button type="submit" className="self-end" disabled={!uid || !roleId}>Save assignment</Button>
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!!error && <ErrorNotice error={error} operation="Assign role" />}
  </form>;
}
