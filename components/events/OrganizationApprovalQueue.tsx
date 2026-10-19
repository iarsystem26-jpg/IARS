import ErrorNotice from '../ui/ErrorNotice';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { appData } from '../../lib/backend';
import { canReviewOrganizations, organizationError } from '../../lib/organizations';
import { formatManilaDateTime, formatClockTime } from '../../lib/dateTime';
import { toast } from '../../lib/toast';
import { useAuth } from '../AuthContext';
import ApprovalQueue, { ApprovalStatus, approvalControl, approvalLabel, ApprovalRow } from '../ui/ApprovalQueue';
import DetailFields from '../ui/DetailFields';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import { AppEvent, Organization, OrganizationSanctionRequest } from '../../types';

type OrganizationRow = ApprovalRow & { organization: Organization; event?: AppEvent; sanction?: OrganizationSanctionRequest };

export default function OrganizationApprovalQueue() {
  const { profile } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const organizations = appData.getOrganizations().filter(org => org.can_review || org.can_manage || profile?.role === 'admin');
  const rows: OrganizationRow[] = organizations.flatMap(organization => [
    ...appData.getEvents().filter(event => event.organizationId === organization.id && event.approvalStatus && !event.cancellationStatus).map(event => ({
      id: `event:${event.id}`, title: `${event.title} — ${organization.name}`, status: event.approvalStatus!, type: 'event', searchText: event.description, organization, event,
    })),
    ...appData.getOrganizationSanctions().filter(request => request.organization_id === organization.id).map(sanction => ({
      id: `sanction:${sanction.id}`, title: `Sanction request — ${sanction.student_name || organization.name}`, status: sanction.status, type: 'sanction', searchText: `${organization.name} ${sanction.student_id}`, organization, sanction,
    })),
  ]);
  const selected = rows.find(row => row.id === selectedId);
  const canReview = selected?.status === 'pending' && (selected.organization.can_review ?? canReviewOrganizations(profile));
  const expiredEvent = Boolean(selected?.event && selected.event.startTime <= Date.now());
  const review = async (status: 'approved' | 'rejected') => {
    if (!selected || busy || !canReview || expiredEvent || (status === 'rejected' && !notes.trim())) return;
    setBusy(true); setError('');
    try {
      await appData.organizationCommand(selected.event ? 'reviewEvent' : 'reviewSanction', {
        organizationId: selected.organization.id, ...(selected.event ? { eventId: selected.event.id } : { requestId: selected.sanction!.id }), status, notes: notes.trim(),
      });
      setSelectedId(null); toast.success(`Organization request ${status}.`);
    } catch (err) { setError(organizationError(err)); }
    finally { setBusy(false); }
  };
  return <>
    <ApprovalQueue title="Organization approval queue" description="Review organization event and sanction requests in your assigned scope."
      rows={rows} types={[{ value: 'event', label: 'Events' }, { value: 'sanction', label: 'Sanctions' }]}
      onOpen={row => { setSelectedId(row.id); setNotes(''); setError(''); }} emptyMessage="No organization requests match your filters." />
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) setSelectedId(null); }} size="lg" title={selected?.event?.title || 'Organization sanction request'} description={selected?.organization.name}
      footer={canReview ? <><Button variant="danger" disabled={busy || expiredEvent || !notes.trim()} onClick={() => review('rejected')}>Reject</Button><Button variant="gold" disabled={busy || expiredEvent} onClick={() => review('approved')}>{busy ? 'Saving…' : 'Approve'}</Button></> : undefined}>
      {selected && <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3"><Link to={`/organizations/${selected.organization.id}`} className="font-semibold text-brand-700 underline dark:text-gold-300">{selected.organization.name}</Link><ApprovalStatus status={selected.status} /></div>
        {selected.event ? <>
          <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><h3 className={approvalLabel}>Event description</h3><p className="whitespace-pre-wrap break-words">{selected.event.description || 'No description provided.'}</p></section>
          <DetailFields fields={[
            { label: 'Starts', value: formatManilaDateTime(selected.event.startTime) }, { label: 'Ends', value: formatManilaDateTime(selected.event.endTime) },
            { label: 'Recipients', value: selected.event.recipientGroups?.join(', ') || selected.event.targetValue || selected.event.participantsType },
            { label: 'Event type', value: selected.event.kind === 'merit' ? 'Merit' : 'Attendance' },
            { label: 'Late sanction', value: `${selected.event.sanctionRules?.late.value || 0} ${selected.event.sanctionRules?.late.unit || 'hours'}` },
            { label: 'Absent sanction', value: `${selected.event.sanctionRules?.absent.value ?? selected.event.penaltyValue} ${selected.event.sanctionRules?.absent.unit || selected.event.penaltyUnit}` },
            { label: 'Attendance windows', value: selected.event.attendanceWindows?.map(window => `${formatClockTime(window.timeIn)} – ${formatClockTime(window.timeOut)}`).join(', ') || 'Scheduled duration' },
            { label: 'Geofence', value: selected.event.geofenceEnabled ? `${selected.event.location.radius_meters} meters (${selected.event.location.lat}, ${selected.event.location.lng})` : 'Disabled' },
          ]} />
          {selected.event.reviewNotes && <DetailFields fields={[{ label: 'Decision notes', value: selected.event.reviewNotes }]} />}
        </> : selected.sanction && <>
          <DetailFields fields={[{ label: 'Student', value: selected.sanction.student_name || selected.sanction.student_id }, { label: 'Requested hours', value: `${selected.sanction.hours} hours` }, { label: 'Submitted', value: formatManilaDateTime(selected.sanction.created_at) }]} />
          <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><h3 className={approvalLabel}>Reason for sanction</h3><p className="whitespace-pre-wrap break-words">{selected.sanction.reason}</p></section>
          {selected.sanction.review_notes && <DetailFields fields={[{ label: 'Decision notes', value: selected.sanction.review_notes }]} />}
        </>}
        {canReview && <div><label className={approvalLabel} htmlFor="organization-review-notes">Decision notes (required for rejection)</label><textarea id="organization-review-notes" rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} className={approvalControl} /></div>}
        {canReview && expiredEvent && <p className="text-amber-700 dark:text-amber-300">The organization must reschedule this event before it can be reviewed.</p>}
        {error && <ErrorNotice error={error} operation="Organization Approval Queue"></ErrorNotice>}
      </div>}
    </Modal>
  </>;
}
