import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { useState } from 'react';
import { FileText, KeyRound, ShieldCheck } from 'lucide-react';
import { appData, documentUrl } from '../../lib/backend';
import { managedAccountRoles } from '../../lib/accountProvisioning';
import { roleLabels } from '../../lib/accessControl';
import { formatManilaDateTime } from '../../lib/dateTime';
import { isValidPassword } from '../../lib/passwordPolicy';
import { Application, UserProfile } from '../../types';
import Button from '../ui/Button';
import ManagedPasswordField from '../ui/ManagedPasswordField';
import ProfileAvatar from '../ui/ProfileAvatar';
import { AccountAccessInfo } from './ManagedAccountsTable';

function Detail({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{value || 'Not provided'}</dd></div>;
}

function ApplicationDocument({ label, path }: { label: string; path: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    // Open during the click so browsers allow the tab while the signed URL resolves.
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError('Allow pop-ups to view this document.'); return; }
    tab.opener = null;
    setLoading(true); setError('');
    try {
      const url = await documentUrl(path);
      if (!['https:', 'http:'].includes(new URL(url, window.location.origin).protocol)) throw new Error('Invalid document URL.');
      tab.location.replace(url);
    } catch {
      tab.close(); setError('Unable to open this document. Please try again.');
    } finally { setLoading(false); }
  };
  return <div><Button size="sm" fullWidth={false} variant="secondary" loading={loading} onClick={open}><FileText size={14} /> {label.replaceAll('_', ' ')}</Button>
    {error && <ErrorNotice error={error} operation="Account Profile Panel"></ErrorNotice>}</div>;
}

export default function AccountProfilePanel({ account, access, accessLoading, accessError, applications }: {
  account: UserProfile; access?: AccountAccessInfo; accessLoading: boolean; accessError: string; applications: Application[];
}) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const role = managedAccountRoles.find(item => item.id === account.role)?.label || roleLabels[account.role] || account.role;
  const assignment = account.official_data?.assignment_node_id || account.school_data?.academic_assignment?.terminalGroupId;
  const unit = assignment ? appData.getSchoolNodePath(assignment).map(node => node.name).join(' / ') : account.official_data?.scope;
  const enrollment = applications.filter(application => application.id === account.uid || application.form_data.uid === account.uid)
    .sort((a, b) => b.submission_date - a.submission_date);
  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !isValidPassword(password)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await appData.resetAccountPassword(account.uid, password);
      setPassword(''); setMessage(`Password updated for ${account.name}.`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  };
  return <div className="space-y-6">
    <div className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <ProfileAvatar src={account.photo_url} alt={`${account.name}'s profile photo`} className="h-20 w-20 shrink-0 rounded-2xl border border-white bg-white object-cover shadow-sm dark:border-slate-700" />
      <div className="min-w-0"><p className="break-words text-lg font-bold text-brand-900 dark:text-white">{account.name}</p>
        <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">@{account.username}</p>
        <div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-gold-100 px-2.5 py-1 text-xs font-semibold text-brand-900 dark:bg-gold-500/15 dark:text-gold-300">{role}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{account.account_status || 'active'}</span></div>
      </div>
    </div>
    <section aria-label="Account details" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-white"><ShieldCheck size={17} /> Account details</h3>
      <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700">
        <Detail label="Email" value={account.email} /><Detail label="ID number" value={account.student_id} />
        <Detail label="Phone" value={account.phone} /><Detail label="Position" value={account.official_data?.position} />
        <div className="sm:col-span-2"><Detail label="Assigned unit" value={account.role === 'admin' ? 'System-wide access' : unit || account.school_data?.section} /></div>
        <Detail label="Account created" value={access?.created_at ? formatManilaDateTime(access.created_at) : 'Unavailable'} />
        <Detail label="Last sign-in (Manila time)" value={access?.last_sign_in_at ? formatManilaDateTime(access.last_sign_in_at) : access ? 'Never signed in' : accessLoading ? 'Loading…' : 'Unavailable'} />
      </dl>
      {accessError && <ErrorNotice error={accessError} operation="Account Profile Panel"></ErrorNotice>}
    </section>
    <section aria-label="Enrollment applications" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-white"><FileText size={17} /> Enrollment applications <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">{enrollment.length}</span></h3>
      {!enrollment.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No enrollment application is linked to this account.</p>}
      {enrollment.map(application => <article key={application.id} className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Enrollment application</h4><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize dark:bg-slate-700">{application.status}</span></div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Submitted" value={formatManilaDateTime(application.submission_date)} />
          <Detail label="Reviewed" value={application.reviewed_at ? formatManilaDateTime(application.reviewed_at) : 'Not reviewed yet'} />
          <Detail label="Applicant" value={application.form_data.name} /><Detail label="School type" value={application.form_data.school_data?.type} />
          <Detail label="Department / program" value={application.form_data.school_data?.program || application.form_data.school_data?.department} />
          <Detail label="Level / section" value={[application.form_data.school_data?.level, application.form_data.school_data?.section].filter(Boolean).join(' / ')} />
          {application.rejection_reason && <div className="sm:col-span-2"><Detail label="Review notes" value={application.rejection_reason} /></div>}
          {!!application.clarification_fields?.length && <div className="sm:col-span-2"><Detail label="Requested clarifications" value={application.clarification_fields.map(field => field.replaceAll('_', ' ')).join(', ')} /></div>}
        </dl>
        {!!Object.keys(application.documents || {}).length && <div className="flex flex-wrap gap-2">{Object.entries(application.documents || {}).filter(([, path]) => Boolean(path)).map(([label, path]) => <ApplicationDocument key={label} label={label} path={path} />)}</div>}
      </article>)}
    </section>
    <form onSubmit={updatePassword} className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
      <div><h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-white"><KeyRound size={17} /> Password management</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Set a new password and share it securely with the account holder.</p></div>
      <fieldset disabled={saving} className="min-w-0"><ManagedPasswordField label="New password" value={password} onChange={value => { setPassword(value); setMessage(''); setError(''); }} /></fieldset>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</p>}
      {error && <ErrorNotice error={error} operation="Account Profile Panel"></ErrorNotice>}
      <div className="flex justify-end"><Button className="sm:w-auto" type="submit" loading={saving} disabled={!isValidPassword(password)}>Update password</Button></div>
    </form>
  </div>;
}
