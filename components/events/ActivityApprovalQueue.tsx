import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Button from '../ui/Button';
import ApprovalQueue, { approvalControl, approvalLabel } from '../ui/ApprovalQueue';
import ActivityRequestDetails, { activityRequester } from './ActivityRequestDetails';
import { Modal } from '../ui/Modal';
import { appData } from '../../lib/backend';
import { hasPermission } from '../../lib/accessControl';
import { canManageEventInScope } from '../../lib/eventAudience';
import { AppEvent } from '../../types';

export default function ActivityApprovalQueue({ purpose }: { purpose?: 'event' | 'ceremony' }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!profile) return null;
  const reviewer = ['ossa', 'ossa_staff'].includes(profile.role) && hasPermission(profile.role, 'events.approve');
  const requests = appData.getVisibleEvents(profile.uid).filter(event => event.requiresOssaApproval
    && !event.cancellationStatus && event.status !== 'done'
    && (!purpose || (purpose === 'ceremony') === (event.kind === 'flag_ceremony')));
  const selected = requests.find(event => event.id === selectedId);
  const canReview = (event: AppEvent) => reviewer && event.created_by !== profile.uid
    && event.approvalStatus === 'pending' && canManageEventInScope(profile, event, appData.getSchoolStructure());
  const review = async (decision: 'approved' | 'rejected') => {
    if (!selected || busy || !canReview(selected) || (decision === 'rejected' && !notes.trim()) || (decision === 'approved' && selected.startTime <= Date.now())) return;
    setBusy(true); setError('');
    try { await appData.reviewEvent(selected.id, decision, notes.trim()); setSelectedId(null); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  if (!requests.length && !reviewer) return null;
  return <>
    <ApprovalQueue collapsible title={purpose === 'event' ? 'Event approvals' : purpose === 'ceremony' ? 'Ceremony approvals' : 'Event & ceremony approvals'} description="Open a request to review its schedule, recipients, attendance rules, and supporting details."
      rows={requests.map(event => {
        const requester = activityRequester(event.created_by);
        return { id: event.id, title: event.title, status: event.approvalStatus || 'pending', type: event.kind === 'flag_ceremony' ? 'ceremony' : 'event',
          subtitle: `Requested by ${requester.name}`,
          searchText: `${event.description || ''} ${requester.name} ${requester.identity} ${event.organizationId ? appData.getOrganizations().find(org => org.id === event.organizationId)?.name || '' : ''}` };
      })}
      types={purpose ? undefined : [{ value: 'event', label: 'Events' }, { value: 'ceremony', label: 'Ceremonies' }]}
      onOpen={row => { setSelectedId(row.id); setNotes(''); setError(''); }} emptyMessage="No activity requests match your filters." />
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) setSelectedId(null); }} title={selected?.title || 'Activity request'} description="Review the activity before it becomes available for attendance." size="lg" footer={selected && canReview(selected) ? <><Button variant="danger" disabled={busy || !notes.trim()} onClick={() => review('rejected')}>Reject</Button><Button variant="gold" disabled={busy || selected.startTime <= Date.now()} onClick={() => review('approved')}>{busy ? 'Saving…' : 'Approve'}</Button></> : undefined}>
      {selected && <div className="space-y-4 text-sm">
        <ActivityRequestDetails event={selected} />
        {canReview(selected) && <><label className={approvalLabel} htmlFor="activity-review-notes">Decision notes (required for rejection)</label><textarea id="activity-review-notes" className={approvalControl} rows={3} maxLength={2000} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} />
          {selected.startTime <= Date.now() && <p className="text-amber-700">The author must reschedule this activity before approval.</p>}
          {error && <ErrorNotice error={error} operation="Activity Approval Queue"></ErrorNotice>}
        </>}
      </div>}
        {selected && selected.approvalStatus !== 'approved' && hasPermission(profile.role, 'events.manage') && canManageEventInScope(profile, selected, appData.getSchoolStructure()) && <Button fullWidth={false} variant="secondary" disabled={busy} onClick={() => navigate(selected.organizationId ? `/organizations/${selected.organizationId}/events/${selected.id}/edit` : `/ssg/${selected.kind === 'flag_ceremony' ? 'ceremonies' : 'events'}/${selected.id}/edit`)}>Edit request</Button>}
    </Modal>
  </>;
}
