import ErrorNotice from '../components/ui/ErrorNotice';
import { OrganizationCardsSkeleton } from '../components/ui/PageLoading';
import { hierarchyPathForRole } from '../lib/workspaceRoutes';
import { usePageMemory } from '../components/usePageMemory';
import { formatManilaDate, formatManilaDateTime, formatClockTime } from '../lib/dateTime';
import EventBanner from '../components/events/EventBanner';
import { eventDisplayTitle } from '../lib/eventGroups';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Building2, Plus, Settings, Users } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import OrganizationForm from '../components/academic/OrganizationForm';
import Button from '../components/ui/Button';
import CustomSelect from '../components/ui/CustomSelect';
import ProfileAvatar from '../components/ui/ProfileAvatar';
import SearchInput from '../components/ui/SearchInput';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Modal } from '../components/ui/Modal';
import { appData } from '../lib/backend';
import { canCreateOrganization, canManageOrganization, canReviewOrganizations, organizationError } from '../lib/organizations';
import { findNodeById } from '../lib/academicDirectory';
import type { Organization } from '../types';

export default function Organizations({ publicDirectory = false }: { publicDirectory?: boolean }) {
  const { profile, revision } = useAuth();
  const navigate = useNavigate();
  const { organizationId } = useParams();
  const [publicItems, setPublicItems] = useState<Organization[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(publicDirectory);
  const [query, setQuery] = usePageMemory('query', '');
  const [form, setForm] = useState<'create' | Organization | null>(null);
  const [joining, setJoining] = useState<Organization | null>(null);
  const [joinKey, setJoinKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<Awaited<ReturnType<typeof appData.getOrganizationPeople>>>([]);
  const [student, setStudent] = useState('');
  const [sanctionStudent, setSanctionStudent] = useState('');
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [attendanceEvent, setAttendanceEvent] = useState('');
  const [attendanceStudent, setAttendanceStudent] = useState('');
  const [attendanceReason, setAttendanceReason] = useState('');
  const organizations = publicDirectory ? publicItems : appData.getOrganizations();
  const organization = organizations.find(o => o.id === organizationId);
  const manager = Boolean(organization && canManageOrganization(profile, organization));
  const reviewer = organization?.can_review ?? canReviewOrganizations(profile);
  const members = appData.getOrganizationMemberships().filter(m => m.organization_id === organizationId);
  const events = appData.getEvents().filter(e => e.organizationId === organizationId);
  const requests = appData.getOrganizationSanctions().filter(r => r.organization_id === organizationId);
  const personName = (uid: string) => people.find(p => p.uid === uid)?.name || (uid === profile?.uid ? profile.name : uid);
  const unitName = (org: Organization) => org.node_id ? findNodeById(appData.getSchoolStructure(), org.node_id)?.name || 'Academic unit' : 'General school';

  useEffect(() => {
    let active = true;
    if (publicDirectory) appData.getPublicOrganizations().then(items => { if (active) setPublicItems(items); })
      .catch(error => { if (active) setError(organizationError(error)); }).finally(() => { if (active) setLoadingPublic(false); });
    return () => { active = false; };
  }, [publicDirectory]);
  useEffect(() => {
    let active = true; setPeople([]);
    if (organizationId && manager) appData.getOrganizationPeople(organizationId).then(items => { if (active) setPeople(items); })
      .catch(error => { if (active) setError(organizationError(error)); });
    return () => { active = false; };
  }, [organizationId, manager, revision]);

  const run = async (action: string, payload: Record<string, unknown>, message: string) => {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try { await appData.organizationCommand(action, { organizationId, ...payload }); setNotice(message); return true; }
    catch (error) { setError(organizationError(error)); return false; }
    finally { setBusy(false); }
  };
  const reviewButtons = (id: string, action: 'reviewEvent' | 'reviewSanction') => <div className="flex flex-wrap gap-2 mt-3">
    <input aria-label={`Review notes for ${id}`} placeholder="Review notes" className="input-field max-w-sm" maxLength={2000} value={notes[id] || ''} onChange={e => setNotes({ ...notes, [id]: e.target.value })} />
    {(['approved', 'rejected'] as const).map(status => <Button key={status} size="sm" variant={status === 'approved' ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(action,
      { [action === 'reviewEvent' ? 'eventId' : 'requestId']: id, status, notes: notes[id] || '' }, `Request ${status}.`)}>{status === 'approved' ? 'Approve' : 'Reject'}</Button>)}
  </div>;

  if (!publicDirectory && !organizationId && canCreateOrganization(profile)) return <Navigate replace to={hierarchyPathForRole(profile?.role)} />;
  const hierarchyPath = `${hierarchyPathForRole(profile?.role)}${organization?.node_id ? `?unit=${encodeURIComponent(organization.node_id)}` : ''}`;
  return <Page>
    <PageHeader eyebrow="Campus community" title={organization?.name || 'Organizations'} description={organization?.description || 'Discover organizations, join your community, and take part in attendance and merit events.'}
      actions={organization ? <><Button variant="secondary" onClick={() => navigate(canCreateOrganization(profile) ? hierarchyPath : '/organizations')}>{canCreateOrganization(profile) ? 'Back to hierarchy' : 'All organizations'}</Button>{manager && <Button variant="secondary" onClick={() => setForm(organization)}><Settings size={16} /> Settings</Button>}</>
        : publicDirectory ? <Link className="btn-secondary" to={profile ? '/organizations' : '/login'}>{profile ? 'My organizations' : 'Sign in to join'}</Link>
          : canCreateOrganization(profile) ? <Button onClick={() => setForm('create')}><Plus size={16} /> Establish organization</Button> : undefined} />
    {error && <ErrorNotice error={error} operation="Organizations"></ErrorNotice>}
    {notice && <p role="status" className="text-emerald-700 dark:text-emerald-300 text-sm">{notice}</p>}
    {organizationId && !organization && <Surface className="p-5">This organization is unavailable or private.</Surface>}
    {!organizationId && <>
      <SearchInput ariaLabel="Search organizations" placeholder="Search organizations" value={query} onChange={setQuery} />
      {loadingPublic && <div role="status" aria-label="Loading organizations" aria-busy="true"><OrganizationCardsSkeleton /></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{organizations.filter(o => `${o.name} ${o.description} ${unitName(o)}`.toLowerCase().includes(query.toLowerCase())).map(org => {
        const membership = appData.getOrganizationMemberships().find(m => m.organization_id === org.id && m.student_id === profile?.uid);
        const manage = !publicDirectory && canManageOrganization(profile, org);
        const pending = appData.getOrganizationSanctions().filter(r => r.organization_id === org.id && r.status === 'pending').length + appData.getEvents().filter(e => e.organizationId === org.id && e.approvalStatus === 'pending').length;
        return <Surface key={org.id} className="p-5 space-y-3">
          <div className="flex items-center gap-3"><ProfileAvatar src={org.logo_url} alt={`${org.name} logo`} className="h-14 w-14 rounded-xl object-cover" /><div><h2 className="font-bold">{org.name}</h2><p className="text-sm text-slate-500">{unitName(org)}</p></div></div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{org.description || 'A school organization.'}</p>
          <p className="text-xs">{org.visible ? 'Public' : 'Hidden'} · {org.joining === 'closed' ? 'Joining closed' : org.joining === 'approval' ? 'Applications open' : 'Open joining'}{org.key_required ? ' · Join key required' : ''}</p>
          {membership && <p className="text-sm font-semibold">{membership.status === 'approved' ? 'Member' : membership.status === 'pending' ? 'Application pending' : 'Application rejected — you may apply again'}</p>}
          {manage && pending > 0 && <p className="text-sm text-amber-700">{pending} awaiting OSAS review</p>}
          {!publicDirectory && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => navigate(`/organizations/${org.id}`)}>{manage ? 'Manage organization' : 'View organization'}</Button>
            {['student','mayor','ssg'].includes(profile?.role || '') && org.visible && org.joining !== 'closed' && (!membership || membership.status === 'rejected') && <Button size="sm" onClick={() => { setJoining(org); setJoinKey(''); setError(''); }}>{org.joining === 'approval' ? 'Apply to join' : 'Join'}</Button>}</div>}
        </Surface>;
      })}</div>
      {!loadingPublic && organizations.length === 0 && <Surface className="p-8 text-center"><Building2 className="mx-auto mb-3" /><p>No organizations are available yet.</p></Surface>}
    </>}
    {organization && <>
      <Surface className="p-5 flex flex-wrap items-center gap-4"><ProfileAvatar src={organization.logo_url} alt={`${organization.name} logo`} className="h-20 w-20 rounded-xl object-cover" />
        <div><p className="font-semibold">{unitName(organization)}</p><p className="text-sm">{organization.visible ? 'Visible to the public' : 'Hidden from the public'} · {organization.joining === 'closed' ? 'Self joining closed' : organization.joining === 'approval' ? 'Applications open' : 'Open joining'}</p></div>
        {members.some(m => m.student_id === profile?.uid) && <Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm('Leave this organization or withdraw your application?')) void run('leave', {}, 'You have left the organization.'); }}>Leave / withdraw</Button>}
      </Surface>
      {manager && <Surface className="p-5 space-y-4">
        <h2 className="font-bold flex gap-2"><Users size={19} /> Members & applications</h2>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><CustomSelect label="Add a student from your own unit" searchable value={student} onChange={v => setStudent(String(v))}
          options={people.filter(p => p.can_add && ['student','mayor','ssg'].includes(p.role) && !members.some(m => m.student_id === p.uid && m.status === 'approved')).map(p => ({ value: p.uid, label: `${p.name} · ${p.student_id}` }))} /></div>
          <Button disabled={busy || !student} onClick={async () => { if (await run('addMember', { studentId: student }, 'Member added.')) setStudent(''); }}>Add member</Button></div>
        {members.length === 0 && <p className="text-sm text-slate-500">No members or applications yet.</p>}
        {members.map(m => <div key={m.student_id} className="flex flex-wrap justify-between gap-3 border-t border-slate-200 dark:border-slate-700 pt-3"><div><p className="font-medium">{personName(m.student_id)}</p><p className="text-xs">{m.status} · {formatManilaDate(m.created_at)}</p></div><div className="flex flex-wrap gap-2">
          {m.status === 'pending' && <><Button size="sm" disabled={busy} onClick={() => run('reviewMember', { studentId: m.student_id, status: 'approved' }, 'Application approved.')}>Accept</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => run('reviewMember', { studentId: m.student_id, status: 'rejected' }, 'Application rejected.')}>Reject</Button></>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Remove ${personName(m.student_id)} from this organization?`)) void run('removeMember', { studentId: m.student_id }, 'Membership removed.'); }}>Remove</Button></div></div>)}
      </Surface>}
      <Surface className="p-5 space-y-4"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">Organization events</h2>{manager && <Button size="sm" onClick={() => navigate(`/organizations/${organization.id}/events/create`)}><Plus size={15} /> Create event / merit activity</Button>}</div>
        <p className="text-sm text-slate-500">Events with late or absence sanctions need OSAS approval before attendance opens. Merit is awarded once after all required attendance sessions are completed.</p>
        {!events.length && <p className="text-sm">No events yet.</p>}
        {events.map(e => <article className="border-t border-slate-200 dark:border-slate-700 pt-4" key={e.id}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{e.isGeneralEvent ? <button type="button" className="underline" onClick={() => navigate(`/organizations/${organization.id}/events/${e.id}`)}>{e.title}</button> : eventDisplayTitle(e, events)}</h3><p className="text-sm">{e.isGeneralEvent ? 'General event (duration)' : e.kind === 'merit' ? `Merit · ${e.meritHours} hours` : 'Attendance event'} · {e.approvalStatus} · {e.cancellationStatus || e.status}</p><p className="text-xs mt-1">{formatManilaDateTime(e.startTime)} – {formatManilaDateTime(e.endTime)}</p>
          <p className="text-xs mt-1">Late: {e.sanctionRules?.late.value || 0} {e.sanctionRules?.late.unit || 'hours'} · Absent: {e.sanctionRules?.absent.value || 0} {e.sanctionRules?.absent.unit || 'hours'}</p>{e.reviewNotes && <p className="text-sm mt-2">OSAS: {e.reviewNotes}</p>}</div>
          {e.bannerUrl && <EventBanner src={e.bannerUrl} alt={`${e.title} banner`} />}{e.venue && <p className="text-sm">Location: {e.venue}</p>}{e.attendanceWindows?.map(w => <p key={w.id} className="text-xs">{w.label}: {formatClockTime(w.timeIn)} – {formatClockTime(w.timeOut)}</p>)}
          {manager && e.isGeneralEvent && e.status !== 'done' && !e.cancellationStatus && <Button size="sm" onClick={() => navigate(`/organizations/${organization.id}/events/create?parent=${e.id}`)}>Add specific event</Button>}
          {manager && e.status !== 'done' && <div className="flex gap-2">{e.startTime > Date.now() && <Button size="sm" variant="secondary" onClick={() => navigate(`/organizations/${organization.id}/events/${e.id}/edit`)}>Edit</Button>}<Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm('Cancel this organization event?')) void run('cancelEvent', { eventId: e.id }, 'Event cancelled.'); }}>Cancel event</Button></div>}</div>
          {reviewer && e.approvalStatus === 'pending' && reviewButtons(e.id, 'reviewEvent')}
        </article>)}
      </Surface>
      {manager && <Surface className="p-5 space-y-4"><h2 className="font-bold">Record organization attendance</h2><p className="text-sm text-slate-500">Verify the member's identity in person. Attendance uses the event's schedule and geofence.</p>
        <div className="grid gap-3 sm:grid-cols-2"><CustomSelect label="Active event" value={attendanceEvent} onChange={v => setAttendanceEvent(String(v))} options={events.filter(e => !e.isGeneralEvent && e.approvalStatus === 'approved' && e.status === 'active' && !e.cancellationStatus).map(e => ({ value: e.id, label: eventDisplayTitle(e, events) }))} />
          <CustomSelect label="Member attending" searchable value={attendanceStudent} onChange={v => setAttendanceStudent(String(v))} options={members.filter(m => m.status === 'approved').map(m => ({ value: m.student_id, label: personName(m.student_id) }))} /></div>
        <label className="app-field-label">Reason for manual entry<input className="input-field mt-2" value={attendanceReason} onChange={e => setAttendanceReason(e.target.value)} placeholder="Identity verified in person" /></label>
        <div className="flex gap-2">{(['in','out'] as const).map(direction => <Button key={direction} disabled={busy || !attendanceEvent || !attendanceStudent || attendanceReason.trim().length < 5} onClick={async () => {
          setBusy(true); setError(''); setNotice('');
          try {
            const event = events.find(e => e.id === attendanceEvent)!;
            const gps = event.geofenceEnabled ? await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })) : undefined;
            const position = gps ? { latitude: gps.coords.latitude, longitude: gps.coords.longitude, accuracy: gps.coords.accuracy, timestamp: gps.timestamp } : undefined;
            await appData.logAttendance(attendanceEvent, attendanceStudent, undefined, undefined, undefined, direction, { position, manualReason: attendanceReason });
            setNotice(`Attendance ${direction === 'in' ? 'in' : 'out'} recorded.`);
          } catch (error) { setError(organizationError(error)); } finally { setBusy(false); }
        }}>Record {direction === 'in' ? 'time in' : 'time out'}</Button>)}</div>
      </Surface>}
      {(manager || requests.length > 0) && <Surface className="p-5 space-y-4"><h2 className="font-bold">Sanctions · OSAS approval</h2>
        {manager && <><p className="text-sm text-slate-500">Submitted hours do not affect a student's balance until OSAS approves them.</p><div className="grid gap-3 sm:grid-cols-2">
          <CustomSelect label="Member" searchable value={sanctionStudent} onChange={v => setSanctionStudent(String(v))} options={members.filter(m => m.status === 'approved').map(m => ({ value: m.student_id, label: personName(m.student_id) }))} />
          <label className="app-field-label">Sanction hours<input type="number" min="0.01" max="1000" step="0.01" className="input-field mt-2" value={hours} onChange={e => setHours(Number(e.target.value))} /></label></div>
          <label className="app-field-label">Reason<textarea className="input-field mt-2" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <Button disabled={busy || !sanctionStudent || !Number.isFinite(hours) || hours <= 0 || hours > 1000 || reason.trim().length < 5} onClick={async () => { if (await run('requestSanction', { studentId: sanctionStudent, hours, reason }, 'Sanction sent to OSAS for approval.')) setReason(''); }}>Submit to OSAS</Button></>}
        {requests.map(r => <article key={r.id} className="border-t border-slate-200 dark:border-slate-700 pt-3"><p className="font-semibold">{personName(r.student_id)} · {r.hours} hours · {r.status}</p><p className="text-sm mt-1">{r.reason}</p>{r.review_notes && <p className="text-sm mt-1">OSAS: {r.review_notes}</p>}{reviewer && r.status === 'pending' && reviewButtons(r.id, 'reviewSanction')}</article>)}
      </Surface>}
    </>}
    {profile && form && <OrganizationForm key={typeof form === 'string' ? form : form.id} profile={profile} organization={typeof form === 'string' ? undefined : form} onClose={() => setForm(null)} />}
    {joining && <Modal open onClose={() => { if (!busy) setJoining(null); }} title={`${joining.joining === 'approval' ? 'Apply to' : 'Join'} ${joining.name}`} footer={<><Button variant="secondary" disabled={busy} onClick={() => setJoining(null)}>Cancel</Button><Button disabled={busy || (joining.key_required && !joinKey)} onClick={async () => {
      if (await run('join', { organizationId: joining.id, key: joinKey }, joining.joining === 'approval' ? 'Application submitted to the organization heads.' : 'You have joined the organization.')) setJoining(null);
    }}>{joining.joining === 'approval' ? 'Submit application' : 'Join organization'}</Button></>}>
      {error && <ErrorNotice error={error} operation="Organizations"></ErrorNotice>}
      <p className="text-sm">Membership is available to students within {unitName(joining)}.</p>
      {joining.key_required && <label className="app-field-label mt-4 block">Join key<input autoComplete="off" type="password" className="input-field mt-2" value={joinKey} onChange={e => setJoinKey(e.target.value)} /></label>}
    </Modal>}
  </Page>;
}
