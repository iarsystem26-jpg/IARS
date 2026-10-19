import ErrorNotice from '../ui/ErrorNotice';
import React, { useEffect, useState } from 'react';
import { ChevronRight, FilePenLine } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { usePagination } from '../usePagination';
import { Surface } from '../ui/Page';
import ApprovalStatistics from '../ui/ApprovalStatistics';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';
import RecordPagination from '../ui/RecordPagination';
import { Modal } from '../ui/Modal';
import ProfileAvatar from '../ui/ProfileAvatar';
import { appData } from '../../lib/backend';
import { assignmentLabel, transferDestinations } from '../../lib/studentTransfers';
import { findNodePath } from '../../lib/academicDirectory';
import { AcademicPathPicker } from '../academic/AcademicPathPicker';
import { formatManilaDateTime } from '../../lib/dateTime';
import { toast } from '../../lib/toast';
import { fieldDecision, loadProfileRequests, optionalRequestFields, profileRequestTitle, profileRequestValues, requestError, requestFields, reviewProfileRequest, submitProfileRequest, type ProfileRequest, type RequestField } from '../../lib/profileRequests';

const control = 'app-control w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const muted = 'text-sm text-slate-500 dark:text-slate-400';
const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', partially_approved: 'Partially approved' };
const badge = (status: keyof typeof statusLabels) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : status === 'rejected' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{statusLabels[status]}</span>;

export default function ProfileRequests({ review = false, studentUid }: { review?: boolean; studentUid?: string }) {
  const { profile } = useAuth();
  const eligible = Boolean(profile && (review ? ['admin', 'ossa', 'ossa_staff'] : ['student', 'mayor']).includes(profile.role));
  const [rows, setRows] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ProfileRequest['kind'] | null>(null);
  const [draft, setDraft] = useState<Record<RequestField, string> | null>(null);
  const [deleting, setDeleting] = useState<RequestField[]>([]);
  const [reason, setReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState(studentUid ? 'all' : 'pending');
  const [query, setQuery] = useState('');
  const uid = profile?.uid;
  const nodes = appData.getSchoolStructure();
  const currentAssignment = profile ? profileRequestValues(profile).node_id : '';
  const destinations = transferDestinations(nodes).filter(node => node.id !== currentAssignment);
  const editFields = (Object.keys(requestFields) as RequestField[]).filter(key => key !== 'node_id');
  const displayValue = (key: RequestField, value?: string) => key === 'node_id' && value ? assignmentLabel(nodes, value) === 'Unassigned' ? value : assignmentLabel(nodes, value) : value;
  const visible = rows.filter(row => (!studentUid || row.student_id === studentUid) && (!review || filter === 'all' || row.status === filter) && `${profileRequestTitle(row)} ${row.student_number} ${row.reason}`.toLowerCase().includes(query.toLowerCase()));
  const pagination = usePagination(visible, JSON.stringify([uid, filter, query]));
  const selected = rows.find(row => row.id === selectedId);
  const requester = selected ? (selected.student_id === profile?.uid ? profile : appData.getUserDetail(selected.student_id)?.profile) : null;
  const pendingFields = selected ? (Object.keys(selected.changes) as RequestField[]).filter(key => fieldDecision(selected, key) === 'pending') : [];
  useEffect(() => {
    if (!eligible) return;
    let active = true;
    const load = async () => {
      try { const result = await loadProfileRequests(studentUid); if (active) setRows(result); }
      catch (err) { if (active) setError(requestError(err)); }
      finally { if (active) setLoading(false); }
    };
    setRows([]); setSelectedId(null); setLoading(true); setError(''); void load();
    window.addEventListener('rmc_data_update', load);
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('rmc_data_update', load); };
  }, [uid, eligible, studentUid]);
  if (!eligible || !profile) return null;
  const pending = rows.some(row => row.status === 'pending');
  const open = (value: ProfileRequest['kind']) => { setError(''); setKind(value); setDraft({ ...profileRequestValues(profile), ...(value === 'transfer' ? { node_id: '' } : {}) }); setDeleting([]); setReason(''); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!kind || !draft || busy) return;
    setBusy(true); setError('');
    try {
      const baseline = profileRequestValues(profile); const changes: ProfileRequest['changes'] = {};
      if (kind === 'transfer') {
        if (!destinations.some(node => node.id === draft.node_id)) throw new Error('Choose a different active destination class.');
        changes.node_id = draft.node_id;
      } else if (kind === 'deletion') deleting.forEach(key => { changes[key] = ''; });
      else editFields.forEach(key => { if (draft[key].trim() !== baseline[key]) changes[key] = draft[key].trim(); });
      if (!Object.keys(changes).length) throw new Error('Choose information to change or delete.');
      await submitProfileRequest(kind, changes, reason.trim()); setKind(null);
      toast.success('Request submitted for OSSA or admin review.'); setRows(await loadProfileRequests());
    } catch (err) { setError(requestError(err)); } finally { setBusy(false); }
  };
  const decide = async (decision: 'approved' | 'rejected', fields?: RequestField[]) => {
    if (!selected || busy || studentUid) return;
    setBusy(true); setError('');
    try {
      await reviewProfileRequest(selected.id, decision, note.trim(), fields);
      toast.success(`${fields ? 'Change' : 'All pending changes'} ${decision}. The student has been notified.`);
      setRows(await loadProfileRequests());
    } catch (err) { setError(requestError(err)); } finally { setBusy(false); }
  };
  const canReview = review && !studentUid;
  const canDecide = canReview && !busy && note.trim().length >= 3 && note.trim().length <= 2000;
  return <>
    {review && !studentUid && <ApprovalStatistics rows={rows} includePartial loading={loading} />}
    <Surface className="space-y-4 p-4 sm:p-5" aria-label={review ? 'Student information requests' : 'My information requests'}>
    <div><h2 className="text-lg font-bold">{studentUid ? 'Information request history' : review ? 'Request queue' : 'Information & transfer requests'}</h2><p className={`mt-1 ${muted}`}>{studentUid ? 'Open a request to view the requested changes and review decisions.' : review ? 'Open a request to compare its values and review individual changes or all pending changes.' : 'Submit corrections, request a class transfer, or delete optional contact and guardian information. Changes require OSSA or admin approval.'}</p></div>
    {!review && <><p className={muted}>Deletion keeps your account, student identity, academic assignment, and attendance records. Request a transfer to correct your academic assignment or move to another class.</p><div className="flex flex-wrap gap-2"><Button size="sm" className="sm:w-auto" disabled={pending || loading || busy || !!error} onClick={() => open('edit')}>Request information change</Button><Button size="sm" className="sm:w-auto" variant="secondary" disabled={pending || loading || busy || !!error} onClick={() => open('deletion')}>Request information deletion</Button><Button size="sm" className="sm:w-auto" variant="secondary" disabled={pending || loading || busy || !!error} onClick={() => open('transfer')}>Request transfer</Button></div>{pending && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">You have a pending request. Wait for its decision before submitting another.</p>}</>}
    {review && <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]"><div><label htmlFor="request-search" className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">Search requests</label><input id="request-search" className={control} aria-label="Search information requests" placeholder="Search title, student name or ID" value={query} onChange={e => setQuery(e.target.value)} /></div><CustomSelect label="Status" ariaLabel="Request status" value={filter} onChange={value => setFilter(String(value))} options={[...Object.entries(statusLabels).map(([value,label]) => ({value,label})), {value:'all',label:'All requests'}]} /></div>}
    {error && !kind && !selected && <ErrorNotice error={error} operation="Profile Requests"></ErrorNotice>}
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"><table className="w-full table-fixed text-sm" aria-label={review ? 'Information request table' : 'My request history'}><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th scope="col" className="px-4 py-3">Request</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
      {loading ? <tr><td className="p-6 text-center" role="status">Loading requests…</td></tr> : !pagination.visible.length ? <tr><td className="p-8 text-center text-slate-500 dark:text-slate-400"><FilePenLine className="mx-auto mb-3 text-slate-300 dark:text-slate-600" size={28} />No {review && filter !== 'all' ? statusLabels[filter as keyof typeof statusLabels]?.toLowerCase() + ' ' : ''}requests.</td></tr> : pagination.visible.map(row => <tr key={row.id} className="transition hover:bg-brand-50/50 dark:hover:bg-slate-900/50"><td><button type="button" className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left font-semibold text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-gold-500 dark:text-white" onClick={() => { setSelectedId(row.id); setNote(''); setError(''); }}><span className="min-w-0 flex-1"><span className="block break-words">{profileRequestTitle(row)}</span>{studentUid && <span className="mt-1.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{formatManilaDateTime(row.created_at)}</span>}{studentUid && <span className="mt-2 inline-flex sm:hidden">{badge(row.status)}</span>}</span>{studentUid && <span className="hidden sm:inline-flex">{badge(row.status)}</span>}<ChevronRight size={18} className="shrink-0 text-slate-400" /></button></td></tr>)}
    </tbody></table><RecordPagination {...pagination} customPageSize label="Information request pagination" /></div>
    <Modal open={!!kind} onClose={() => { if (!busy) { setKind(null); setError(''); } }} title={kind === 'transfer' ? 'Request transfer' : kind === 'edit' ? 'Request information change' : 'Request optional information deletion'}>
      {kind && draft && <form onSubmit={submit} className="space-y-4"><p className="text-sm">{kind === 'transfer' ? 'Choose the class you want to transfer to. Your assignment stays in place until approval. Attendance history and balances stay with you. Transferred mayors become students.' : kind === 'deletion' ? 'Select the optional information to delete. Your account and school records will be retained.' : 'Enter the corrected information. Your current records remain in place until approval.'}</p>
        {kind === 'transfer' ? <div className="space-y-3"><p className={muted}>Current assignment: {assignmentLabel(nodes, currentAssignment)}</p><p className="text-sm font-semibold">Destination class</p><AcademicPathPicker roots={nodes} value={(findNodePath(nodes, draft.node_id) || []).map(node => node.id)} onChange={path => setDraft({ ...draft, node_id: path.at(-1)?.id || '' })} purpose="registration" disabled={busy} />{!destinations.length && <p role="status" className={muted}>No other active classes are available. Contact OSSA for assistance.</p>}</div> : kind === 'edit' ? <div className="grid gap-3 sm:grid-cols-2">{editFields.map(key => <div key={key}><label htmlFor={`request-${key}`} className="text-sm font-semibold">{requestFields[key]}</label><input id={`request-${key}`} className={control} value={draft[key]} maxLength={200} required={key === 'name' || key === 'student_id'} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></div>)}</div> : <div className="space-y-3">{optionalRequestFields.map(key => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={deleting.includes(key)} disabled={!draft[key]} onChange={e => setDeleting(e.target.checked ? [...deleting, key] : deleting.filter(item => item !== key))} />{requestFields[key]}{!draft[key] && ' (not provided)'}</label>)}</div>}
        <div><label htmlFor="request-reason" className="text-sm font-semibold">Reason for request</label><textarea id="request-reason" className={control} rows={3} required minLength={10} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></div>{error && <ErrorNotice error={error} operation="Profile Requests"></ErrorNotice>}<Button type="submit" loading={busy} disabled={busy || reason.trim().length < 10 || (kind === 'deletion' && !deleting.length) || (kind === 'transfer' && !destinations.some(node => node.id === draft.node_id))}>Submit request</Button>
      </form>}
    </Modal>
    <Modal open={!!selected} size="lg" onClose={() => { if (!busy) { setSelectedId(null); setError(''); } }} title={canReview ? 'Review student information request' : 'Information request details'} footer={canReview && pendingFields.length > 0 ? <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end"><Button className="sm:w-auto" variant="secondary" disabled={!canDecide} onClick={() => decide('rejected')}>Reject all pending ({pendingFields.length})</Button><Button className="sm:w-auto" loading={busy} disabled={!canDecide} onClick={() => decide('approved')}>Approve all pending ({pendingFields.length})</Button></div> : <Button className="sm:w-auto" onClick={() => setSelectedId(null)}>Close</Button>}>
      {selected && <div className="space-y-5">
        <section aria-label="Requester profile" className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">Requested by</h3>{badge(selected.status)}</div>
          <div className="flex items-center gap-3">
            <ProfileAvatar src={requester?.photo_url} alt={`${requester?.name || selected.student_name}'s profile photo`} className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-gold-400" />
            <div className="min-w-0"><p className="break-words font-bold text-brand-900 dark:text-white">{requester?.name || selected.student_name}</p><p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">Student ID: {requester?.student_id || selected.student_number}</p>
              {requester?.school_data && <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{[requester.school_data.department || requester.school_data.program || requester.school_data.level, requester.school_data.section].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>
          {requester && (requester.name !== selected.student_name || requester.student_id !== selected.student_number) && <p className="mt-3 break-words text-xs text-slate-500 dark:text-slate-400">At submission: {selected.student_name} · {selected.student_number}</p>}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Submitted {formatManilaDateTime(selected.created_at)}</p>
        </section>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><h3 className="mb-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Reason for request</h3><p className="whitespace-pre-wrap break-words text-sm">{selected.reason}</p></div>
        {selected.kind === 'deletion' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Approval deletes only the selected optional information. The student account and school records remain.</p>}
        {canReview && pendingFields.length > 0 && <div><label className="mb-1.5 block text-sm font-semibold" htmlFor="request-review-note">Decision note (sent to student)</label><textarea id="request-review-note" className={control} rows={2} minLength={3} maxLength={2000} placeholder="Explain your decision before approving or rejecting." value={note} onChange={e => setNote(e.target.value)} /><p className={`mt-1 ${muted}`}>This note accompanies each decision. Previously reviewed changes stay unchanged.</p></div>}{error && <ErrorNotice error={error} operation="Profile Requests"></ErrorNotice>}
        <div className="space-y-4">{(Object.keys(selected.changes) as RequestField[]).map(key => { const status = fieldDecision(selected, key); const record = selected.field_decisions?.[key]; return <section key={key} aria-label={`${requestFields[key]} comparison`} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/30"><h3 className="font-bold">{requestFields[key]}</h3>{badge(status)}</div>
          <dl className="grid gap-3 p-4 sm:grid-cols-2"><div className="min-w-0 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><dt className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Old value (at submission)</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{displayValue(key, selected.original[key]) || (selected.kind === 'deletion' && status === 'approved' ? 'Deleted from request history' : 'Not provided')}</dd></div><div className={`min-w-0 rounded-xl p-3 ${selected.kind === 'deletion' ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-emerald-50 dark:bg-emerald-950/40'}`}><dt className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">{selected.kind === 'deletion' ? 'Requested deletion' : 'New value (requested)'}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold">{selected.kind === 'deletion' ? 'Remove this information' : displayValue(key, selected.changes[key]) || 'Not provided'}</dd></div></dl>
          {canReview && status === 'pending' && <div className="flex flex-wrap gap-2 px-4 pb-4"><Button size="sm" className="sm:w-auto" disabled={!canDecide} aria-label={`Approve ${requestFields[key]}`} onClick={() => decide('approved', [key])}>Approve change</Button><Button size="sm" className="sm:w-auto" variant="secondary" disabled={!canDecide} aria-label={`Reject ${requestFields[key]}`} onClick={() => decide('rejected', [key])}>Reject change</Button></div>}
          {status !== 'pending' && <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"><p className="whitespace-pre-wrap break-words">{record?.reviewer_name || selected.reviewer_name || 'Reviewer'}: {record?.note || selected.review_note}</p>{(record?.reviewed_at || selected.reviewed_at) && <p className="mt-1">{formatManilaDateTime(record?.reviewed_at || selected.reviewed_at!)}</p>}</div>}
        </section>; })}</div>{!pendingFields.length && <p className={muted}>All changes in this request have been reviewed.</p>}
      </div>}
    </Modal>
  </Surface>
  </>;
}
