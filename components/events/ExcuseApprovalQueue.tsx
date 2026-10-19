import ErrorNotice from '../ui/ErrorNotice';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ExcuseApplication } from '../../types';
import { appData, documentUrl } from '../../lib/backend';
import { formatManilaDateTime } from '../../lib/dateTime';
import { organizationError } from '../../lib/organizations';
import { toast } from '../../lib/toast';
import ApprovalQueue, { ApprovalStatus, approvalControl, approvalLabel } from '../ui/ApprovalQueue';
import DetailFields from '../ui/DetailFields';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';

export default function ExcuseApprovalQueue({ applications, onChanged }: { applications: ExcuseApplication[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hours, setHours] = useState('2');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingProof, setOpeningProof] = useState(false);
  const [error, setError] = useState('');
  const selected = applications.find(item => item.id === selectedId);
  const validHours = hours.trim() !== '' && Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 50;
  const review = async (status: 'approved' | 'rejected') => {
    if (!selected || busy || selected.status !== 'pending' || (status === 'approved' && !validHours) || (status === 'rejected' && !notes.trim())) return;
    setBusy(true); setError('');
    try {
      await appData.reviewExcuseApplication(selected.id, status, notes.trim() || 'Approved by OSSA.', status === 'approved' ? Number(hours) : 0);
      onChanged(); setSelectedId(null); toast.success(`Excuse application ${status}.`);
    } catch (err) { setError(organizationError(err)); }
    finally { setBusy(false); }
  };
  const openProof = async () => {
    if (!selected?.proof_url || openingProof) return;
    // Open during the click gesture so browsers permit the signed document tab.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpeningProof(true); setError('');
    try { const url = await documentUrl(selected.proof_url); if (tab) tab.location.href = url; else setError('Allow pop-ups to open the supporting document.'); }
    catch (err) { tab?.close(); setError(organizationError(err)); }
    finally { setOpeningProof(false); }
  };
  return <>
    <ApprovalQueue title="Excuse application queue" description="Open a submission to review the student’s reason, supporting document, and hours to waive."
      rows={[...applications].sort((a, b) => b.submission_date - a.submission_date).map(item => ({ id: item.id, title: `${item.event_title} — ${item.student_name}`, status: item.status, type: item.category, searchText: `${item.student_id} ${item.department} ${item.section}` }))}
      types={['medical', 'personal', 'institutional', 'emergency'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
      onOpen={row => { setSelectedId(row.id); setHours('2'); setNotes(''); setError(''); }} emptyMessage="No excuse applications match your filters." />
    <Modal open={Boolean(selected)} onClose={() => { if (!busy && !openingProof) setSelectedId(null); }} size="lg" title="Excuse application" description={selected ? `${selected.event_title} — ${selected.student_name}` : undefined}
      footer={selected?.status === 'pending' ? <><Button variant="danger" aria-label="Reject excuse" disabled={busy || !notes.trim()} onClick={() => review('rejected')}>Reject</Button><Button variant="gold" aria-label="Approve & waive hours" disabled={busy || !validHours} onClick={() => review('approved')}>{busy ? 'Saving…' : 'Approve'}</Button></> : undefined}>
      {selected && <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3"><span className="font-semibold capitalize">{selected.category} excuse</span><ApprovalStatus status={selected.status} /></div>
        <DetailFields fields={[{ label: 'Student', value: `${selected.student_name} (${selected.student_id})` }, { label: 'Department / section', value: `${selected.department} / ${selected.section}` }, { label: 'Submitted', value: formatManilaDateTime(selected.submitted_at || selected.submission_date) }, { label: 'Event', value: selected.event_title }, ...(selected.contact_mobile ? [{ label: 'Contact number', value: selected.contact_mobile }] : [])]} />
        <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><h3 className={approvalLabel}>Reason for absence</h3><p className="whitespace-pre-wrap break-words">{selected.reason}</p></section>
        {selected.proof_url ? <Button fullWidth={false} variant="secondary" disabled={openingProof} onClick={openProof}><ExternalLink size={16} />{openingProof ? 'Opening document…' : 'View supporting document'}</Button> : <p className="text-slate-500 dark:text-slate-400">No supporting document attached.</p>}
        {selected.status === 'pending' ? <>
          <div><label className={approvalLabel} htmlFor="ossa-waive-hours">Sanction hours to waive upon approval</label><input id="ossa-waive-hours" type="number" min="0" max="50" step="any" value={hours} onChange={event => setHours(event.target.value)} className={approvalControl} disabled={busy} />{!validHours && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Enter hours between 0 and 50.</p>}</div>
          <div><label className={approvalLabel} htmlFor="ossa-excuse-note">Decision notes (required for rejection)</label><textarea id="ossa-excuse-note" rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} className={approvalControl} disabled={busy} /></div>
        </> : <DetailFields fields={[{ label: 'Decision notes', value: selected.review_notes || 'No notes provided.' }, { label: 'Hours waived', value: selected.waived_hours || 0 }, { label: 'Reviewed', value: selected.reviewed_at ? formatManilaDateTime(selected.reviewed_at) : 'Not recorded' }, { label: 'Reviewed by', value: selected.reviewed_by || 'OSSA' }]} />}
        {error && <ErrorNotice error={error} operation="Excuse Approval Queue"></ErrorNotice>}
      </div>}
    </Modal>
  </>;
}
