import React from 'react';
import { appData } from '../../lib/backend';
import { formatClockTime, formatManilaDateTime } from '../../lib/dateTime';
import { recipientGroupLabel } from '../../lib/eventAudience';
import { DEFAULT_EXCUSE_WINDOW_DAYS } from '../../lib/excusePolicy';
import { AppEvent, EventAttendanceWindow } from '../../types';
import DetailFields from '../ui/DetailFields';
import { ApprovalStatus } from '../ui/ApprovalQueue';

export function activityRequester(uid: string) {
  const person = appData.getUserDetail(uid)?.profile;
  return {
    name: person?.name || `Account ${uid || '(not recorded)'}`,
    role: person?.role ? person.role.replace(/_/g, ' ').toUpperCase() : 'Profile unavailable',
    identity: person?.student_id || uid || 'Not recorded',
  };
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
    <h3 className="text-base font-bold text-brand-900 dark:text-white">{title}</h3>{children}
  </section>;
}

function Windows({ windows }: { windows: EventAttendanceWindow[] }) {
  return <ol className="space-y-2">{windows.map((window, index) => <li key={window.id || index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
    <div><p className="font-semibold">{window.label || `Window ${index + 1}`}</p><p className="mt-1 text-slate-500 dark:text-slate-400">{formatClockTime(window.timeIn)} – {formatClockTime(window.timeOut)}</p></div>
    <span className="text-xs text-slate-500 dark:text-slate-400">Late after {window.lateAfterMinutes} minutes</span>
  </li>)}</ol>;
}

export default function ActivityRequestDetails({ event }: { event: AppEvent }) {
  const directory = appData.getSchoolStructure();
  const requester = activityRequester(event.created_by);
  const organization = event.organizationId ? appData.getOrganizations().find(org => org.id === event.organizationId) : undefined;
  const personLabel = (uid: string) => {
    const person = appData.getUserDetail(uid)?.profile;
    return person ? `${person.name}${person.student_id ? ` (${person.student_id})` : ''}` : `Account ${uid}`;
  };
  const groupLabel = (group: string) => group.startsWith('person:') ? personLabel(group.slice(7)) : recipientGroupLabel(group, directory);
  const audience = event.audienceTarget;
  const groups = audience?.mode === 'specific_people' ? audience.specificUserIds?.map(personLabel)
    : audience?.mode === 'directory_node' && audience.nodeId ? [recipientGroupLabel(`node:${audience.nodeId}`, directory)]
    : (audience?.groups || event.recipientGroups)?.map(groupLabel);
  const recipients = groups?.length ? groups : event.specificParticipants?.length ? event.specificParticipants.map(personLabel)
    : [...(event.target?.department || []), ...(event.target?.strand || []), ...(event.target?.section || [])].length
      ? [...(event.target?.department || []), ...(event.target?.strand || []), ...(event.target?.section || [])]
      : [event.targetValue || (event.target?.all || event.participantsType === 'all' ? 'All students' : event.participantsType || 'Not specified')];
  const excuseDays = event.excuseWindowDays ?? DEFAULT_EXCUSE_WINDOW_DAYS;
  const activityType = event.kind === 'flag_ceremony' ? event.ceremony?.flagKind === 'retreat' ? 'Flag retreat / lowering' : 'Flag raising'
    : event.isGeneralEvent ? 'General event' : event.kind === 'service' ? 'Sanction / cleaning service' : event.kind === 'merit' ? 'Merit activity' : 'Attendance event';
  return <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-brand-900 dark:text-white">{activityType}</span><ApprovalStatus status={event.approvalStatus || 'pending'} /></div>
      <DetailFields fields={[
        { label: 'Requested by', value: requester.name }, { label: 'Requester role', value: requester.role },
        { label: 'Student / official ID', value: requester.identity }, { label: 'Submitted', value: event.timestamp ? formatManilaDateTime(event.timestamp) : 'Not recorded' },
      ]} />
    </div>
    <DetailSection title="Activity overview">
      <p className="whitespace-pre-wrap break-words leading-relaxed">{event.description || 'No description provided.'}</p>
      {event.bannerUrl && <img src={event.bannerUrl} alt={`${event.title} banner`} className="max-h-64 w-full rounded-xl object-contain" />}
      <DetailFields fields={[
        { label: 'Venue', value: event.venue || 'Not specified' },
        { label: 'Related event', value: event.parentEventTitle || (event.parentEventId ? appData.getEvents().find(item => item.id === event.parentEventId)?.title || 'Unavailable event' : 'Standalone activity') },
      ]} />
    </DetailSection>
    <DetailSection title="Schedule & audience">
      <DetailFields fields={[
        { label: 'Starts (Manila time)', value: formatManilaDateTime(event.startTime) },
        { label: 'Ends (Manila time)', value: formatManilaDateTime(event.endTime) },
        { label: 'Management unit', value: event.scopeNodeId ? recipientGroupLabel(`node:${event.scopeNodeId}`, directory) : 'Not specified' },
        { label: 'Organization', value: organization?.name || (event.organizationId ? 'Unavailable organization' : 'Institutional activity') },
        { label: 'Recipients', value: <ul className="space-y-1">{recipients.map((label, index) => <li key={index}>{label}</li>)}</ul> },
        { label: 'Recurrence', value: event.recurrence ? `Weekly · ${event.recurrence.occurrences} occurrences` : event.seriesId ? 'Part of a scheduled series' : 'Single activity' },
        ...(audience?.mode === 'directory_node' ? [{ label: 'Include sub-units', value: audience.includeDescendants === false ? 'No' : 'Yes' }] : []),
      ]} />
    </DetailSection>
    <DetailSection title="Attendance & rules">
      {event.attendanceWindows?.length ? <Windows windows={event.attendanceWindows} /> : <p>Attendance follows the scheduled activity duration.</p>}
      <DetailFields fields={[
        { label: 'Late sanction', value: `${event.sanctionRules?.late.value ?? 0} ${event.sanctionRules?.late.unit || 'hours'}` },
        { label: 'Absent sanction', value: `${event.sanctionRules?.absent.value ?? event.penaltyValue} ${event.sanctionRules?.absent.unit || event.penaltyUnit}` },
        { label: 'Geofence', value: event.geofenceEnabled ? `${event.location.radius_meters} m radius · ${event.location.lat}, ${event.location.lng}` : 'Disabled' },
        { label: 'Excuse submission', value: event.isGeneralEvent || ['service', 'merit'].includes(event.kind || '') ? 'Not applicable' : excuseDays === 0 ? 'Closes when the activity ends' : `Closes ${excuseDays} days after the activity ends` },
        ...(event.kind === 'merit' ? [{ label: 'Merit credit', value: `${event.meritHours ?? 0} hours` }] : []),
        ...(event.service ? [{ label: 'Excess service hours', value: event.service.overflow === 'merit' ? 'Convert to merit' : 'Clear excess hours' }] : []),
      ]} />
    </DetailSection>
    {event.ceremony && <DetailSection title="Ceremony exceptions & volunteer credit">
      <DetailFields fields={[
        { label: 'Schedule policy', value: event.ceremony.useStandardSchedule ? event.ceremony.flagKind === 'retreat' ? 'Standard ceremony week · Friday retreat' : 'Standard ceremony week · Monday raising' : 'Custom ceremony dates' },
        { label: 'Volunteer merit', value: event.ceremony.allowVolunteerMerit ? `${event.ceremony.volunteerMeritHours} hours` : 'Disabled' },
        { label: 'Exempt students', value: event.ceremony.exemptStudentIds.length ? <ul className="space-y-1">{event.ceremony.exemptStudentIds.map(uid => <li key={uid}>{personLabel(uid)}</li>)}</ul> : 'None' },
      ]} />
      {Object.entries(event.ceremony.classWindows).map(([nodeId, windows]) => <div key={nodeId} className="space-y-2"><h4 className="font-semibold">{recipientGroupLabel(`node:${nodeId}`, directory)}</h4><Windows windows={windows} /></div>)}
      {!Object.keys(event.ceremony.classWindows).length && <p className="text-slate-500 dark:text-slate-400">All classes follow the activity attendance windows.</p>}
      {Object.entries(event.ceremony.exemptStudentIdsByDate || {}).map(([date, ids]) => <div key={date}><h4 className="font-semibold">Exemptions for {date}</h4><ul className="mt-2 space-y-1">{ids.map(uid => <li key={uid}>{personLabel(uid)}</li>)}</ul></div>)}
    </DetailSection>}
    {(event.reviewNotes || event.reviewedAt || event.reviewedBy) && <DetailSection title="Review history">
      <DetailFields fields={[
        { label: 'Reviewed by', value: event.reviewedBy ? personLabel(event.reviewedBy) : 'Not recorded' },
        { label: 'Reviewed on', value: event.reviewedAt ? formatManilaDateTime(event.reviewedAt) : 'Not recorded' },
      ]} />
      {event.reviewNotes && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 dark:bg-slate-900">{event.reviewNotes}</p>}
    </DetailSection>}
  </div>;
}
