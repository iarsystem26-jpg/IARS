import { selectUploadFile } from '../../lib/fileUploads';
import ErrorNotice from '../ui/ErrorNotice';
import { useSmartBack } from '../NavigationMemory';
import { DEFAULT_EXCUSE_WINDOW_DAYS, MAX_EXCUSE_WINDOW_DAYS } from '../../lib/excusePolicy';
import { TimeInput } from '../ui/TimeInput';
import { formatClockTime } from '../../lib/dateTime';
import EventBanner from './EventBanner';
import ScheduleClosureNotice from './ScheduleClosureNotice';
import { createDriveImage, fileAsDataUrl } from '../../lib/googleDrive';
import { errorMessage } from '../../lib/errors';
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, ArrowLeft, CalendarRange, CircleOff, Clock3, Crosshair, MapPin, Plus, Save as SaveIcon, Trash2, Users2, XCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { GeofenceMap } from '../../components/events/GeofenceMap';
import { FlagProtocolSettings } from '../../components/events/FlagProtocolSettings';
import { hasPermission } from '../../lib/accessControl';
import { dateStamp } from '../../lib/ceremonySchedule';
import { CeremonySchedulePicker } from '../../components/events/CeremonySchedulePicker';
import { CeremonyAttendanceSettings } from '../../components/events/CeremonyAttendanceSettings';
import { canScheduleCeremony, validWindows } from '../../lib/ceremonySchedule';
import { EventRecipientPicker } from '../../components/events/EventRecipientPicker';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import { Page, PageHeader, Surface } from '../../components/ui/Page';
import { canManageEventInScope, eventRecipientRoots, recipientGroupLabel } from '../../lib/eventAudience';
import { findNodePath, flattenDirectory, getDirectorySubtree } from '../../lib/academicDirectory';
import { appData } from '../../lib/backend';
import { AppEvent, EventAttendanceWindow, EventSanctionRule, Organization } from '../../types';

const newWindow = (index: number): EventAttendanceWindow => ({
  id: `window-${Date.now()}-${index}`,
  label: `Window ${index}`,
  timeIn: '',
  timeOut: '',
  lateAfterMinutes: 15,
});

// The page fixes the purpose; changing activity types cannot turn an event into a ceremony.
const ActivityForm: React.FC<{ purpose: 'event' | 'ceremony'; organization?: Organization }> = ({ purpose, organization }) => {
  const navigate = useNavigate();
  const back = useSmartBack();
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const isCeremony = purpose === 'ceremony';
  const { profile, revision, loading } = useAuth();
  const editingEvent = useMemo(() => eventId ? appData.getEvents().find((event) => event.id === eventId) : undefined, [eventId]);
  const isEditing = Boolean(editingEvent);
  const requiresApproval = Boolean(editingEvent?.requiresOssaApproval || hasPermission(profile?.role, 'events.require_ossa_approval'));
  const phasedCreation = !eventId;
  const phases = ['Details', 'Schedule', 'Attendees', 'Rules & Location', 'Review'];
  const [phase, setPhase] = useState(0);
  const [phaseError, setPhaseError] = useState('');
  const phaseHeading = useRef<HTMLHeadingElement>(null);
  const goToPhase = (next: number) => {
    setPhase(next);
    setPhaseError('');
    requestAnimationFrame(() => {
      phaseHeading.current?.focus();
      phaseHeading.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  };
  const editingActiveEvent = editingEvent?.status === 'active';
  const datePart = (value: number) => new Date(value + 8 * 3600000).toISOString().slice(0, 10);
  const timePart = (value: number) => new Date(value + 8 * 3600000).toISOString().slice(11, 16);
  const [kind, setKind] = useState<AppEvent['kind']>(isCeremony ? 'flag_ceremony' : editingEvent?.kind || 'attendance');
  const [isGeneralEvent, setIsGeneralEvent] = useState(editingEvent?.isGeneralEvent || false);
  const [parentEventId, setParentEventId] = useState(editingEvent?.parentEventId || searchParams.get('parent') || '');
  const [venue, setVenue] = useState(editingEvent?.venue || '');
  const generalEvents = appData.getEvents().filter(event => event.isGeneralEvent && event.id !== eventId && !event.cancellationStatus && event.status !== 'done' && (event.organizationId || '') === (organization?.id || '') && (organization || canManageEventInScope(profile, event, appData.getSchoolStructure())));
  const parentEvent = generalEvents.find(event => event.id === parentEventId);
  const returnPath = organization ? `/organizations/${organization.id}` : isCeremony ? '/student/ceremonies' : '/ssg/events';
  const [ceremonyDates, setCeremonyDates] = useState<string[]>([]);
  const [ceremony, setCeremony] = useState<NonNullable<AppEvent['ceremony']>>(editingEvent?.ceremony || { exemptStudentIds: [], allowVolunteerMerit: false, volunteerMeritHours: 1, classWindows: {} });
  const [meritHours, setMeritHours] = useState(editingEvent?.meritHours || 1);
  const [serviceOverflow, setServiceOverflow] = useState<'clear' | 'merit'>(editingEvent?.service?.overflow || 'clear');
  const [extensionDate, setExtensionDate] = useState('');
  const [extending, setExtending] = useState(false);
  const canSetOverflow = Boolean(profile && (profile.role === 'admin' || hasPermission(profile.role, 'ossa.manage_cases')));
  const hasRecordedAttendance = Boolean(editingEvent && Object.keys(appData.getAttendanceLogs?.(editingEvent.id) || {}).length);
  const [occurrences, setOccurrences] = useState(1);
  const [saveError, setSaveError] = useState('');
  const [bannerUrl, setBannerUrl] = useState(editingEvent?.bannerUrl || '');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState(editingEvent?.bannerUrl || '');
  const [bannerError, setBannerError] = useState('');
  const [readingBanner, setReadingBanner] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);
  const bannerSelection = useRef(0);
  const selectBanner = async (file?: File) => {
    if (!file) return;
    const selection = ++bannerSelection.current;
    setReadingBanner(false);
    setBannerError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setBannerError('Choose a JPG, PNG, or WebP banner of 5 MB or smaller.');
      if (bannerInput.current) bannerInput.current.value = '';
      return;
    }
    try {
      setReadingBanner(true);
      const preview = await fileAsDataUrl(file);
      if (selection !== bannerSelection.current) return;
      setBannerFile(file); setBannerPreview(preview);
    } catch { if (selection === bannerSelection.current) setBannerError('Unable to read this banner. Choose another image.'); }
    finally { if (selection === bannerSelection.current) setReadingBanner(false); }
  };
  const [title, setTitle] = useState(editingEvent?.title || '');
  const [description, setDescription] = useState(editingEvent?.description || '');
  const [startDate, setStartDate] = useState(editingEvent?.startDate || (editingEvent ? datePart(editingEvent.startTime) : ''));
  const [endDate, setEndDate] = useState(editingEvent?.endDate || (editingEvent ? datePart(editingEvent.endTime) : ''));
  const [selectedGroups, setSelectedGroups] = useState<string[]>(editingEvent?.audienceTarget?.groups
    || (editingEvent?.audienceTarget?.mode === 'directory_node' && editingEvent.audienceTarget.nodeId ? [`node:${editingEvent.audienceTarget.nodeId}`] : undefined)
    || editingEvent?.recipientGroups || [editingEvent?.targetValue || 'All Students']);
  const [geofenceEnabled, setGeofenceEnabled] = useState(editingEvent?.geofenceEnabled ?? false);
  const [location, setLocation] = useState({ lat: editingEvent?.location.lat ?? 7.0736, lng: editingEvent?.location.lng ?? 125.6126, radius: editingEvent?.location.radius_meters ?? 100, isLocating: false });
  const [attendanceWindows, setAttendanceWindows] = useState<EventAttendanceWindow[]>(editingEvent?.attendanceWindows?.length ? editingEvent.attendanceWindows : editingEvent ? [{ id: 'window-1', label: 'Window 1', timeIn: timePart(editingEvent.startTime), timeOut: timePart(editingEvent.endTime), lateAfterMinutes: 15 }] : [newWindow(1)]);
  const [lateSanction, setLateSanction] = useState<EventSanctionRule>(editingEvent?.sanctionRules?.late || { value: 30, unit: 'minutes' });
  const [excuseWindowDays, setExcuseWindowDays] = useState(editingEvent?.excuseWindowDays ?? DEFAULT_EXCUSE_WINDOW_DAYS);
  const [absentSanction, setAbsentSanction] = useState<EventSanctionRule>(editingEvent?.sanctionRules?.absent || (editingEvent ? { value: editingEvent.penaltyValue, unit: editingEvent.penaltyUnit } : { value: 1, unit: 'hours' }));

  const directory = useMemo(() => appData.getSchoolStructure(), [revision]);
  const [managementUnit, setManagementUnit] = useState(directory.length === 1 ? directory[0].id : '');
  const [pendingRecipient, setPendingRecipient] = useState(false);
  const scopeNodeId = editingEvent ? editingEvent.scopeNodeId : parentEvent ? parentEvent.scopeNodeId : profile?.role === 'admin' ? managementUnit : profile?.official_data?.assignment_node_id || profile?.school_data?.academic_assignment?.terminalGroupId;
  const recipientRoots = useMemo(() => scopeNodeId ? getDirectorySubtree(directory, scopeNodeId) : eventRecipientRoots(profile, directory), [profile, directory, scopeNodeId]);
  const managementScopeValid = Boolean(organization || isEditing || scopeNodeId);
  const hasAssignedScope = Boolean(organization) || profile?.role === 'admin' || recipientRoots.length > 0;
  const eventInScope = organization ? !editingEvent || editingEvent.organizationId === organization.id : !editingEvent || canManageEventInScope(profile, editingEvent, directory);
  const recipientGroups = organization ? [`${organization.name} members`] : selectedGroups.map(group => recipientGroupLabel(group, directory));
  const recipientsInScope = Boolean(organization) || selectedGroups.every(group => !group.startsWith('node:')
    || Boolean(findNodePath(recipientRoots, group.slice(5))));

  const ceremonyStudents = useMemo(() => isCeremony && profile ? appData.getVisibleStudents(profile.uid) : [], [isCeremony, profile, revision]);
  const ceremonyDatesValid = ceremonyDates.length > 0 && ceremonyDates.length <= 62 && ceremonyDates.every(day => canScheduleCeremony(day) && (!ceremony.useStandardSchedule || new Date(dateStamp(day)).getUTCDay() === (ceremony.flagKind === 'retreat' ? 5 : 1)));
  const ceremonyValid = !isCeremony || ((isEditing ? startDate === endDate : ceremonyDatesValid)
    && (!ceremony.allowVolunteerMerit || Number.isFinite(ceremony.volunteerMeritHours) && ceremony.volunteerMeritHours > 0 && ceremony.volunteerMeritHours <= 24)
    && Object.values(ceremony.classWindows).every(validWindows));

  const updateWindow = (id: string, update: Partial<EventAttendanceWindow>) => {
    setAttendanceWindows((windows) => windows.map((window) => window.id === id ? { ...window, ...update } : window));
  };

  const captureLocation = () => {
    setLocation((current) => ({ ...current, isLocating: true }));
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation((current) => ({ ...current, lat: position.coords.latitude, lng: position.coords.longitude, isLocating: false })),
      () => {
        window.alert('Location permission was denied. You can still enter coordinates manually.');
        setLocation((current) => ({ ...current, isLocating: false }));
      },
      { enableHighAccuracy: true },
    );
  };

  const datesValid = Boolean(startDate && endDate && endDate >= startDate && (!parentEventId || parentEvent && startDate >= parentEvent.startDate! && endDate <= parentEvent.endDate!));
  const sortedWindows = [...attendanceWindows].sort((a, b) => a.timeIn.localeCompare(b.timeIn));
  const windowsOverlap = sortedWindows.some((window, index) => index > 0 && window.timeIn < sortedWindows[index - 1].timeOut);
  const windowsValid = attendanceWindows.length > 0 && attendanceWindows.every((window) => (
    Boolean(window.timeIn && window.timeOut)
    && window.timeOut > window.timeIn
    && Number.isFinite(window.lateAfterMinutes) && window.lateAfterMinutes >= 0
  ));
  const sanctionsValid = isGeneralEvent || [lateSanction.value, absentSanction.value].every(value => Number.isFinite(value) && value >= 0);
  const activityNumbersValid = (kind !== 'merit' || (Number.isFinite(meritHours) && meritHours > 0 && meritHours <= 24))
    && (isGeneralEvent || Boolean(parentEventId) || isEditing || (Number.isInteger(occurrences) && occurrences >= 1 && occurrences <= 52));
  const excusePolicyValid = isGeneralEvent || ['service', 'merit'].includes(kind || '') || (Number.isInteger(excuseWindowDays) && excuseWindowDays >= 0 && excuseWindowDays <= MAX_EXCUSE_WINDOW_DAYS);
  const numbersValid = sanctionsValid && activityNumbersValid && excusePolicyValid;
  const geofenceValid = isGeneralEvent || !geofenceEnabled || (Number.isFinite(location.lat) && Math.abs(location.lat) <= 90
    && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180
    && Number.isFinite(location.radius) && location.radius >= 10 && location.radius <= 5000);
  const formValid = Boolean(profile && !loading && !readingBanner && managementScopeValid && !pendingRecipient && hasAssignedScope && eventInScope && recipientsInScope && (!eventId || (editingEvent && editingEvent.status !== 'done'))
    && (!editingEvent || (editingEvent.kind === 'flag_ceremony') === isCeremony)
    && title.trim() && description.trim() && (isCeremony && !isEditing || datesValid) && (isGeneralEvent || windowsValid && !windowsOverlap)
    && !hasRecordedAttendance && numbersValid && geofenceValid && recipientGroups.length > 0 && ceremonyValid);

  const [saving, setSaving] = useState(false);
  const phaseIssues = [
    !title.trim() || !description.trim() ? 'Enter a title and instructions before continuing.' : !activityNumbersValid ? 'Check the activity hours and weekly occurrences before continuing.' : '',
    (isCeremony ? !ceremonyDatesValid : !datesValid)
      ? isCeremony ? 'Choose 1 to 62 allowed ceremony dates. Remove preview-only dates and follow the selected ceremony weekday.' : 'Choose a start and end date. The end date must be on or after the start date.'
      : !isGeneralEvent && (!windowsValid || windowsOverlap) ? 'Enter valid, non-overlapping attendance windows and non-negative late thresholds.' : '',
    pendingRecipient ? 'Click Add recipient to include your selected unit before continuing.' : !managementScopeValid ? 'Choose the event management unit.' : !hasAssignedScope || !recipientsInScope || !recipientGroups.length ? 'Choose at least one recipient within your assigned school unit.'
      : isCeremony && !ceremonyValid ? 'Check class attendance windows and volunteer merit hours (greater than 0 and up to 24).' : '',
    !geofenceValid ? 'Enter valid coordinates and a radius between 10 and 5000 meters.' : !sanctionsValid ? 'Sanction values must be zero or greater.' : !excusePolicyValid ? 'Enter a whole number from 0 to 30 excuse submission days.' : '',
  ];
  const nextPhase = () => {
    if (phaseIssues[phase]) { setPhaseError(phaseIssues[phase]); return; }
    goToPhase(phase + 1);
  };
  const scheduleEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phasedCreation && phase < phases.length - 1) { nextPhase(); return; }
    if (!formValid || saving) return;
    setSaving(true); setSaveError('');

    const allWindows = isCeremony ? [...sortedWindows, ...Object.values(ceremony.classWindows).flat()] : sortedWindows;
    const firstWindow = [...allWindows].sort((a, b) => a.timeIn.localeCompare(b.timeIn))[0];
    const lastWindow = [...allWindows].sort((a, b) => b.timeOut.localeCompare(a.timeOut))[0];
    const allStudents = selectedGroups.length === 1 && selectedGroups[0] === 'All Students';
    const targetValue = recipientGroups.join(', ');

    const selectedDates = [...ceremonyDates].sort();
    const savedStart = isCeremony && !isEditing ? selectedDates[0] : startDate;
    const savedEnd = isCeremony && !isEditing ? selectedDates[selectedDates.length - 1] : endDate;
    const payload: Omit<AppEvent, 'id'> = {
      isGeneralEvent, parentEventId: isGeneralEvent ? null : parentEventId || null, venue: venue.trim(),
      kind: isCeremony ? 'flag_ceremony' : isGeneralEvent ? 'attendance' : kind, meritHours: kind === 'merit' ? meritHours : undefined,
      ceremony: isCeremony ? { ...ceremony, exemptStudentIdsByDate: isEditing ? undefined : Object.fromEntries(Object.entries(ceremony.exemptStudentIdsByDate || {}).filter(([day]) => ceremonyDates.includes(day))) } : null,
      service: kind === 'service' ? { overflow: serviceOverflow } : null,
      recurrence: !organization && !isGeneralEvent && !parentEventId && kind === 'attendance' && !isEditing && occurrences > 1 ? { frequency: 'weekly' as const, occurrences } : undefined,
      scopeNodeId,
      title: title.trim(),
      bannerUrl,
      description: description.trim(),
      status: editingEvent?.status || 'upcoming',
      created_by: editingEvent?.created_by || profile!.uid,
      startDate: savedStart,
      endDate: savedEnd,
      startTime: new Date(`${savedStart}T${isGeneralEvent ? '00:00' : firstWindow.timeIn}:00+08:00`).getTime(),
      endTime: new Date(`${savedEnd}T${isGeneralEvent ? '23:59' : lastWindow.timeOut}:00+08:00`).getTime(),
      excuseWindowDays: isGeneralEvent || ['service', 'merit'].includes(kind || '') ? undefined : excuseWindowDays,
      attendanceWindows: isGeneralEvent ? [] : sortedWindows.map((window, index) => ({ ...window, label: window.label?.trim() || `Window ${index + 1}` })),
      sanctionRules: (isGeneralEvent || ['service','merit'].includes(kind || '')) ? { late: {value:0,unit:'hours'}, absent: {value:0,unit:'hours'} } : { late: lateSanction, absent: absentSanction },
      penaltyValue: (isGeneralEvent || ['service','merit'].includes(kind || '')) ? 0 : absentSanction.value,
      penaltyUnit: absentSanction.unit,
      recipientGroups,
      participantsType: allStudents ? 'all' : 'specific',
      targetValue,
      audienceTarget: (allStudents
        ? { mode: 'all' }
        : { mode: 'group_list', groups: selectedGroups, snapshotLabel: targetValue }),
      target: { all: allStudents },
      geofenceEnabled: !isGeneralEvent && geofenceEnabled,
      location: !isGeneralEvent && geofenceEnabled
        ? { lat: location.lat, lng: location.lng, radius_meters: location.radius }
        : { lat: 0, lng: 0, radius_meters: 0 },
      timestamp: Date.now(),
    };
    try {
      if (profile && appData.isUserScopeFrozen(profile) && profile.role !== 'admin') throw new Error('Events are frozen for your scope.');
      if (bannerFile) {
        const uploaded = await createDriveImage(bannerFile, `Event banner - ${title.trim()}`, editingEvent?.id || 'New event', 'banners');
        payload.bannerUrl = uploaded.url;
        setBannerUrl(uploaded.url); setBannerPreview(uploaded.url); setBannerFile(null);
      }
      if (organization) await appData.organizationCommand('saveEvent', { organizationId: organization.id, eventId: editingEvent?.id, event: { ...payload, scopeNodeId: organization.node_id || undefined } });
      else if (editingEvent) await appData.updateEvent(editingEvent.id, payload);
      else if (isCeremony) await appData.createCeremonies(payload, ceremonyDates);
      else await appData.createEvent(payload);
    } catch (error) { setSaveError(errorMessage(error)); return; }
    finally { setSaving(false); }

    navigate(returnPath, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        eyebrow={isCeremony ? "Ceremony management" : "Activity management"}
        title={isCeremony ? isEditing ? 'Edit Ceremony' : 'Create Ceremony' : kind === 'service' ? isEditing ? 'Edit Service Activity' : 'Create Service Activity' : kind === 'merit' ? isEditing ? 'Edit Merit Activity' : 'Create Merit Activity' : isEditing ? 'Edit Event' : 'Create Event'}
        description={isCeremony ? 'Plan flag raising or retreat dates, required attendance, exemptions, and class schedules.' : isEditing ? 'Review this activity and its attendance configuration.' : kind === 'service' ? 'Set the service duration, attendance windows, recipients, and excess-hours policy.' : kind === 'merit' ? 'Set a fixed award and the attendance sessions required to complete this activity.' : 'Configure recipients, attendance windows, geofencing, and sanction rules before scheduling.'}
        actions={<Button variant="secondary" onClick={() => back(returnPath)}><ArrowLeft size={17} /> {isCeremony ? 'Back to Ceremonies' : 'Back to Events'}</Button>}
      />

      {requiresApproval && <Surface className="p-4 text-sm" aria-label="OSSA approval requirement"><strong>OSSA approval required</strong><p>Submit ? Pending OSSA review ? Approved ? Active at the scheduled time. Changes to an approved activity require a new review. Attendance and sanctions remain disabled while pending or rejected.</p>{editingEvent?.approvalStatus && <p className="mt-2 font-bold">Current decision: {editingEvent.approvalStatus}. {editingEvent.reviewNotes}</p>}</Surface>}
      {organization && <Surface className="p-4 text-sm">Organization: <strong>{organization.name}</strong>. Events with sanctions are submitted to OSAS for approval. Editing an approved event sends its sanction rules for review again.</Surface>}
      {phasedCreation && <Surface className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 ref={phaseHeading} tabIndex={-1} className="scroll-mt-6 text-lg font-bold text-brand-900 outline-none dark:text-white">Phase {phase + 1} of {phases.length}: {phases[phase]}</h2>
          <span className="shrink-0 text-sm text-slate-500">{Math.round(phase / (phases.length - 1) * 100)}%</span>
        </div>
        <div role="progressbar" aria-label="Form progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase / (phases.length - 1) * 100} aria-valuetext={`Phase ${phase + 1} of ${phases.length}: ${phases[phase]}`} className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-gold-500 transition-all motion-reduce:transition-none" style={{ width: `${phase / (phases.length - 1) * 100}%` }} />
        </div>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {phases.map((label, index) => <li key={label} aria-current={phase === index ? 'step' : undefined} className={`rounded-xl border p-2 text-sm ${phase === index ? 'border-gold-500 bg-gold-500/10 font-bold text-brand-900 dark:text-white' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}>
            <span className="block text-xs">Phase {index + 1}{index < phase ? ' · Complete' : ''}</span>{label}
          </li>)}
        </ol>
      </Surface>}

      {hasRecordedAttendance && <p role="status" className="text-sm">{kind === 'service' ? 'Attendance has already been recorded. Use the service extension action to add future days without changing credited hours.' : 'Attendance has already been recorded. Configuration is locked to protect attendance and credited hours.'}</p>}
      {editingEvent?.kind === 'service' && eventInScope && editingEvent.status !== 'done' && <Surface className="space-y-3 p-4">
        <h2 className="font-bold">Extend service duration</h2><p className="text-sm">Add future days with the same attendance windows. Existing attendance and credits are preserved.</p>
        <label className="app-field-label block">New service end date<input type="date" className="input-field mt-2" min={endDate} value={extensionDate} onChange={e => setExtensionDate(e.target.value)} /></label>
        <Button type="button" variant="secondary" disabled={extending || !extensionDate || extensionDate <= (editingEvent.endDate || datePart(editingEvent.endTime))} onClick={async () => { setExtending(true); setSaveError(''); try { await appData.extendService(editingEvent.id, extensionDate); navigate(returnPath, { replace: true }); } catch (error) { setSaveError(errorMessage(error)); } finally { setExtending(false); } }}>Extend service days</Button>
      </Surface>}
      <form aria-label={isCeremony ? isEditing ? 'Edit ceremony' : 'Schedule ceremony' : isEditing ? 'Edit attendance event' : 'Schedule attendance event'} className="space-y-6" onSubmit={scheduleEvent}>
        {saveError && <ErrorNotice error={saveError} operation="Activity Form"></ErrorNotice>}
        {phaseError && <ErrorNotice error={phaseError} operation="Activity Form"></ErrorNotice>}
        {!eventInScope && <ErrorNotice error="You can manage events only within your current assigned unit." />}
        {eventId && !editingEvent && <ErrorNotice error="This event was not found or you do not have access to it." />}
        {(!phasedCreation || phase === 3) && !geofenceValid && <ErrorNotice error="Enter valid coordinates and a radius between 10 and 5000 meters." />}
        <fieldset hidden={phasedCreation && phase !== 0} disabled={saving || (phasedCreation && phase !== 0)} className="min-w-0 space-y-6">
        <Surface className="space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-brand-900 dark:text-white">{isCeremony ? 'Flag ceremony schedule' : 'Activity and service schedule'}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{isCeremony ? 'Plan individual ceremony dates, attendance requirements, class schedules, and exemptions. All times use Philippine time.' : kind === 'service' ? 'Each completed session counts its actual time toward sanction clearing. Separate windows keep breaks out of rendered hours.' : kind === 'merit' ? 'A fixed award is released only after every required attendance session is completed.' : 'Choose an activity type and configure its schedule and attendance rules.'}</p>
          {!isCeremony && <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CustomSelect disabled={isEditing} label="Activity type" value={isGeneralEvent ? 'general' : kind} onChange={value => { setIsGeneralEvent(value === 'general'); setKind(value === 'general' ? 'attendance' : value as AppEvent['kind']); if (value === 'general') setParentEventId(''); }} options={[{value:'general',label:'General event (duration)'},{value:'attendance',label:'Attendance event'},...(!organization ? [{value:'service',label:'Sanction / Cleaning Service'}] : []),{value:'merit',label:'Merit activity'}]} />
            {kind === 'merit' && <label className="app-field-label">Fixed merit hours<input type="number" min="0.01" max="24" step="0.01" required className="input-field mt-2" value={meritHours} onChange={event => setMeritHours(Number(event.target.value))}/></label>}
            {!organization && !isEditing && !isGeneralEvent && !parentEventId && kind === 'attendance' && <label className="app-field-label">Weekly occurrences<input type="number" min="1" max="52" required className="input-field mt-2" value={occurrences} onChange={event => setOccurrences(Number(event.target.value))}/><span className="mt-1 block text-xs font-normal normal-case">1 for a single activity; up to 52 weeks.</span></label>}
          </div>}
          {!isCeremony && !isGeneralEvent && <CustomSelect disabled={isEditing} label="General event" value={parentEventId} onChange={value => setParentEventId(String(value))} options={[{ value: '', label: 'Standalone event' }, ...generalEvents.map(event => ({ value: event.id, label: `${event.title} (${event.startDate} to ${event.endDate})` }))]} />}
          {isGeneralEvent && <p className="text-sm">Set the overall duration, then add specific attendance events with their own locations and schedules after saving.</p>}
          {!isCeremony && !isGeneralEvent && <label className="app-field-label block">Location name<input className="input-field mt-2" value={venue} onChange={event => setVenue(event.target.value)} placeholder="e.g. Main gymnasium" /></label>}
          {isCeremony && <FlagProtocolSettings value={ceremony} onChange={setCeremony} onWindowsChange={setAttendanceWindows} />}
          {kind === 'service' && <div className="space-y-3"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={serviceOverflow === 'merit'} disabled={!canSetOverflow} onChange={e => setServiceOverflow(e.target.checked ? 'merit' : 'clear')} />Save excess service hours as earned merit</label><p className="text-sm text-slate-600 dark:text-slate-300">OSAS or an admin controls this setting. Completed service time clears sanctions first. When disabled, any excess is not credited. Breaks and unfinished sessions do not count.</p></div>}
          {kind === 'merit' && <p className="text-sm text-slate-600 dark:text-slate-300">The fixed award is released once, after all attendance windows on every scheduled day have a scan-in and scan-out. It clears outstanding sanctions first; any remainder is saved as earned merit.</p>}
        </Surface>
        <Surface className="space-y-5 p-4 sm:p-6">
          <div><h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><CalendarRange size={20} className="text-gold-500" /> {isCeremony ? 'Ceremony information' : 'Event information'}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isCeremony ? 'Provide the ceremony title and attendance instructions.' : 'Provide the event title and instructions for attendees.'}</p></div>
          <div className="space-y-2"><label htmlFor="event-title" className="app-field-label">{isCeremony ? 'Ceremony Title' : 'Event Title'}</label><input id="event-title" required disabled={editingActiveEvent} className="input-field min-h-12 text-sm disabled:cursor-not-allowed disabled:opacity-60" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isCeremony ? 'e.g. Monday Flag Raising' : 'e.g. College General Assembly'} /></div>
          <div className="space-y-2"><label htmlFor="event-details" className="app-field-label">{isCeremony ? 'Ceremony Details and Instructions' : 'Event Details and Information'}</label><textarea id="event-details" required disabled={editingActiveEvent} rows={6} className="input-field min-h-36 resize-y text-sm leading-6 disabled:cursor-not-allowed disabled:opacity-60" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objectives, attendance instructions, venue details, and reminders" /></div>
          {!isCeremony && <div className="space-y-3">
            <label htmlFor="event-banner" className="app-field-label">Event banner (optional)</label>
            <p id="event-banner-help" className="text-sm text-slate-500">Recommended size: <strong>1600 x 600 pixels</strong> (8:3). JPG, PNG, or WebP, up to 5 MB. Other sizes are cropped to fit.</p>
            <input ref={bannerInput} id="event-banner" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="event-banner-help" className="input-field w-full min-w-0 text-sm" onChange={event => { void selectBanner(selectUploadFile(event.currentTarget)); }} />
            {bannerError && <ErrorNotice error={bannerError} operation="Activity Form"></ErrorNotice>}
            {readingBanner && <p role="status" className="text-sm text-slate-500">Checking banner…</p>}
            {bannerPreview && <><EventBanner src={bannerPreview} alt="Event banner preview" /><Button type="button" variant="secondary" onClick={() => { bannerSelection.current++; setReadingBanner(false); setBannerFile(null); setBannerUrl(''); setBannerPreview(''); setBannerError(''); if (bannerInput.current) bannerInput.current.value = ''; }}>Remove banner</Button></>}
          </div>}
        </Surface>
        </fieldset>
        <fieldset hidden={phasedCreation && phase !== 1} disabled={saving || (phasedCreation && phase !== 1)} className="min-w-0 space-y-6">
        <Surface className="space-y-5 p-4 sm:p-6">
          <h2 className="text-lg font-bold">Schedule dates</h2>
          {isCeremony && !isEditing && <p className="text-sm text-slate-500">Optional prediction range: leave both dates empty to predict the full month shown in the calendar. Enter both only to preview a custom range. Your selected calendar dates determine which ceremonies are created.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label htmlFor="event-start-date" className="app-field-label">Start Date</label><input id="event-start-date" required={!isCeremony || isEditing} disabled={editingActiveEvent} type="date" className="input-field min-h-12 text-sm disabled:cursor-not-allowed disabled:opacity-60" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div className="space-y-2"><label htmlFor="event-end-date" className="app-field-label">End Date</label><input id="event-end-date" required={!isCeremony || isEditing} min={startDate || undefined} type="date" className="input-field min-h-12 text-sm" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          </div>
          {(kind === 'service' || isGeneralEvent) && <label className="app-field-label block">Duration in days<input type="number" min="1" max="366" className="input-field mt-2" disabled={!startDate || hasRecordedAttendance} value={datesValid ? Math.round((dateStamp(endDate)-dateStamp(startDate))/86400000)+1 : ''} onChange={e => { const days=Number(e.target.value); if (startDate && Number.isInteger(days) && days>=1 && days<=366) setEndDate(new Date(dateStamp(startDate)+(days-1)*86400000).toISOString().slice(0,10)); }} /><span className="mt-2 block text-sm font-normal normal-case">{isGeneralEvent ? 'Specific events must fit within this date range.' : 'Attendance windows repeat each day in this date range.'}</span></label>}
          {startDate && endDate && !datesValid && <ErrorNotice error="End date must be on or after the start date and within the selected general event." />}
        </Surface>

        {isCeremony && !isEditing && <CeremonySchedulePicker start={startDate} end={endDate} dates={ceremonyDates} onChange={setCeremonyDates} standardWeekday={ceremony.useStandardSchedule ? ceremony.flagKind === 'retreat' ? 5 : 1 : undefined} />}
        {!isGeneralEvent && <Surface className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><Clock3 size={20} className="text-gold-500" /> Attendance windows</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add each time-in/time-out session and its late threshold.</p></div><Button type="button" variant="secondary" onClick={() => setAttendanceWindows((windows) => [...windows, newWindow(windows.length + 1)])}><Plus size={17} /> Add Attendance Window</Button></div>
          {windowsOverlap && <ErrorNotice error="Attendance windows must not overlap." />}
          {attendanceWindows.some((window) => window.timeIn && window.timeOut && window.timeOut <= window.timeIn) && <ErrorNotice error="Each time out must be later than its time in." />}
          <div className="space-y-4">
            {attendanceWindows.map((window, index) => <fieldset key={window.id} className="min-w-0 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><legend className="px-2 text-sm font-bold text-brand-900 dark:text-white">Window {index + 1}</legend><label className="app-field-label mb-4 block">Window title {index + 1}<input className="input-field mt-2" value={window.label || ''} onChange={event => updateWindow(window.id, { label: event.target.value })} placeholder={`Window ${index + 1}`} /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="space-y-2"><label htmlFor={`time-in-${window.id}`} className="app-field-label">Time In {index + 1}</label><TimeInput aria-label={`Time In ${index + 1}`} id={`time-in-${window.id}`} required type="time" className="input-field min-h-12 text-sm" value={window.timeIn} onChange={(event) => updateWindow(window.id, { timeIn: event.target.value })} /></div><div className="space-y-2"><label htmlFor={`time-out-${window.id}`} className="app-field-label">Time Out {index + 1}</label><TimeInput aria-label={`Time Out ${index + 1}`} id={`time-out-${window.id}`} required type="time" className="input-field min-h-12 text-sm" value={window.timeOut} onChange={(event) => updateWindow(window.id, { timeOut: event.target.value })} /></div><div className="space-y-2"><label htmlFor={`late-after-${window.id}`} className="app-field-label">Late After Minutes {index + 1}</label><input id={`late-after-${window.id}`} type="number" min="0" className="input-field min-h-12 text-sm" value={window.lateAfterMinutes} onChange={(event) => updateWindow(window.id, { lateAfterMinutes: Number(event.target.value) })} /></div></div>{attendanceWindows.length > 1 && <button type="button" aria-label={`Remove attendance window ${index + 1}`} onClick={() => setAttendanceWindows((windows) => windows.filter((item) => item.id !== window.id))} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"><Trash2 size={15} /> Remove window</button>}</fieldset>)}
          </div>
        </Surface>}

        </fieldset>
        <fieldset hidden={phasedCreation && phase !== 2} disabled={saving || (phasedCreation && phase !== 2)} className="min-w-0 space-y-6">
        <Surface className="space-y-5 p-4 sm:p-6">
          <div><h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><Users2 size={20} className="text-gold-500" /> {isCeremony ? 'Required ceremony attendees' : 'Event recipients'}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start with a general unit, then optionally choose a more specific group. Leave “All of” selected to include the whole unit. Add each recipient to include multiple groups.</p></div>
          {!organization && profile?.role === 'admin' && <CustomSelect label="Event management unit" value={scopeNodeId || ''} disabled={isEditing || Boolean(parentEvent)} onChange={value => setManagementUnit(String(value))} options={flattenDirectory(directory).filter(node => !node.metadata?.archived && node.metadata?.selectableForEvents !== false).map(node => ({ value: node.id, label: recipientGroupLabel(`node:${node.id}`, directory) }))} placeholder="Choose the school unit responsible for this event" />}
          {!organization && scopeNodeId && <p className="text-sm">Managed by: <strong>{recipientGroupLabel(`node:${scopeNodeId}`, directory)}</strong>. Recipients and event management are limited to this unit and its sub-units.</p>}
          {organization ? <p className="text-sm">Current approved members of <strong>{organization.name}</strong> are eligible. Membership and unit eligibility are checked when attendance is recorded.</p> : <EventRecipientPicker onChange={setSelectedGroups} onPendingChange={setPendingRecipient} roots={recipientRoots} selected={selectedGroups} />}
          {!organization && profile?.role !== 'admin' && (hasAssignedScope
            ? <p className="text-sm text-slate-600 dark:text-slate-300">You can create and manage events only within <strong>{recipientRoots[0].name}</strong> and its sub-units. All recipient choices, including “All Students”, are limited to this assignment.</p>
            : <ErrorNotice error="An assigned school unit is required to create events. Contact your administrator." />)}
          {!recipientsInScope && <ErrorNotice error="Remove recipients outside your assigned unit before saving." />}
        </Surface>

        {isCeremony && <CeremonyAttendanceSettings value={ceremony} onChange={setCeremony} roots={recipientRoots} students={ceremonyStudents} defaultWindows={attendanceWindows} dates={isEditing ? [startDate] : ceremonyDates} editing={isEditing} canFilter={profile?.role === 'admin' || profile?.role === 'ossa'} />}
        {isCeremony && !ceremonyValid && <ErrorNotice error="Choose allowed ceremony dates, valid class windows, and positive volunteer merit hours (up to 24)." />}
        </fieldset>
        <fieldset hidden={phasedCreation && phase !== 3} disabled={saving || (phasedCreation && phase !== 3)} className="min-w-0 space-y-6">
        {!isGeneralEvent && !['service', 'merit'].includes(kind || '') && <Surface className="space-y-3 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-brand-900 dark:text-white">Excuse submission window</h2>
          <label htmlFor="excuse-window-days" className="app-field-label block">Days to submit after the activity ends</label>
          <input id="excuse-window-days" type="number" min="0" max={MAX_EXCUSE_WINDOW_DAYS} step="1" required className="input-field" value={Number.isNaN(excuseWindowDays) ? '' : excuseWindowDays} onChange={event => setExcuseWindowDays(event.target.value === '' ? NaN : Number(event.target.value))} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Choose 0?30 days. Students may submit in advance once the activity is approved. Zero closes submissions when the activity ends. For repeated ceremonies, each date has its own deadline. A supporting document and OSSA approval are required.</p>
          {!excusePolicyValid && <ErrorNotice error="Enter a whole number from 0 to 30 days." />}
        </Surface>}
        {isGeneralEvent ? <Surface className="p-5 text-sm">Locations, attendance windows and sanctions are configured on each specific event after you save this general event.</Surface> : <Surface className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><MapPin size={20} className="text-gold-500" /> Geofencing</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Require scans to occur inside a defined event perimeter.</p></div><button type="button" role="switch" aria-checked={geofenceEnabled} aria-label="Enable geofencing" onClick={() => setGeofenceEnabled((enabled) => !enabled)} className={`relative h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 ${geofenceEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}><span aria-hidden="true" className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${geofenceEnabled ? 'translate-x-7' : 'translate-x-1'}`} /></button></div>
          {geofenceEnabled ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(16rem,0.65fr)]">
              {(!phasedCreation || phase === 3) && <GeofenceMap value={location} onChange={(point) => setLocation((current) => ({ ...current, ...point }))} />}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  The blue circle is the valid attendance area. Click anywhere on the map or drag the center marker to reposition it.
                </div>
                <div className="space-y-2"><label htmlFor="event-geofence-radius" className="app-field-label">Geofence Radius (meters)</label><input id="event-geofence-radius" type="number" min="10" max="5000" className="input-field min-h-12 text-sm" value={location.radius || ''} onBlur={() => setLocation((current) => ({ ...current, radius: Math.min(5000, Math.max(10, current.radius || 10)) }))} onChange={(event) => setLocation({ ...location, radius: Number(event.target.value) })} /><input aria-label="Adjust geofence radius" type="range" min="10" max="1000" step="1" className="w-full accent-blue-600" value={Math.min(Math.max(location.radius || 10, 10), 1000)} onChange={(event) => setLocation({ ...location, radius: Number(event.target.value) })} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div className="space-y-2"><label htmlFor="event-latitude" className="app-field-label">Latitude</label><input id="event-latitude" type="number" step="any" className="input-field min-h-11 text-sm" value={location.lat} onChange={(event) => setLocation({ ...location, lat: Number(event.target.value) })} /></div><div className="space-y-2"><label htmlFor="event-longitude" className="app-field-label">Longitude</label><input id="event-longitude" type="number" step="any" className="input-field min-h-11 text-sm" value={location.lng} onChange={(event) => setLocation({ ...location, lng: Number(event.target.value) })} /></div></div>
                <Button className="w-full" type="button" variant="secondary" onClick={captureLocation}><Crosshair size={17} className={location.isLocating ? 'animate-spin' : ''} /> Use Current Location</Button>
              </div>
            </div>
          ) : null}
        </Surface>}

        {!isCeremony && (isGeneralEvent || ['service','merit'].includes(kind || '')) ? null : <Surface className="space-y-5 p-4 sm:p-6">
          <div><h2 className="flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-white"><AlertTriangle size={20} className="text-red-500" /> Sanction rules</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set independent sanctions for late and absent attendance.</p></div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <fieldset className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20 sm:grid-cols-[1fr_10rem]"><legend className="px-2 text-sm font-bold text-amber-800 dark:text-amber-200">Late sanction</legend><div className="space-y-2"><label htmlFor="late-sanction-value" className="app-field-label">Late Sanction Value</label><input id="late-sanction-value" type="number" min="0" className="input-field min-h-12 text-sm" value={lateSanction.value} onChange={(event) => setLateSanction({ ...lateSanction, value: Number(event.target.value) })} /></div><CustomSelect label="Late sanction unit" options={[{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }]} value={lateSanction.unit} onChange={(value) => setLateSanction({ ...lateSanction, unit: value as EventSanctionRule['unit'] })} /></fieldset>
            <fieldset className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20 sm:grid-cols-[1fr_10rem]"><legend className="px-2 text-sm font-bold text-red-800 dark:text-red-200">Absent sanction</legend><div className="space-y-2"><label htmlFor="absent-sanction-value" className="app-field-label">Absent Sanction Value</label><input id="absent-sanction-value" type="number" min="0" className="input-field min-h-12 text-sm" value={absentSanction.value} onChange={(event) => setAbsentSanction({ ...absentSanction, value: Number(event.target.value) })} /></div><CustomSelect label="Absent sanction unit" options={[{ value: 'hours', label: 'Hours' }, { value: 'minutes', label: 'Minutes' }]} value={absentSanction.unit} onChange={(value) => setAbsentSanction({ ...absentSanction, unit: value as EventSanctionRule['unit'] })} /></fieldset>
          </div>
        </Surface>}

        </fieldset>
        {phasedCreation && phase === 4 && <Surface className="space-y-5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-brand-900 dark:text-white">Review before scheduling</h2>
          <ScheduleClosureNotice first={isCeremony ? [...ceremonyDates].sort()[0] || startDate : startDate} last={isCeremony ? [...ceremonyDates].sort().at(-1) || endDate : endDate}/>
          {bannerPreview && <EventBanner src={bannerPreview} alt="Event banner preview" />}
          <p className="text-sm text-slate-500">Check the details below. Use Back to make changes, then schedule when ready.</p>
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div><dt className="font-bold">Title</dt><dd className="mt-1 break-words">{title}</dd></div>
            <div><dt className="font-bold">Activity</dt><dd className="mt-1">{isGeneralEvent ? 'General event (duration)' : isCeremony ? ceremony.flagKind === 'retreat' ? 'Flag retreat / lowering' : 'Flag raising' : kind === 'service' ? 'Sanction / Cleaning Service' : kind === 'merit' ? 'Merit activity' : 'Attendance event'}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold">Instructions</dt><dd className="mt-1 whitespace-pre-wrap break-words">{description}</dd></div>
            {parentEvent && <div><dt className="font-bold">General event</dt><dd>{parentEvent.title}</dd></div>}
            {venue && !isGeneralEvent && <div><dt className="font-bold">Location</dt><dd>{venue}</dd></div>}
            <div><dt className="font-bold">Dates</dt><dd className="mt-1">{isCeremony ? [...ceremonyDates].sort().join(', ') : `${startDate} to ${endDate}`}{!isGeneralEvent && !parentEventId && kind === 'attendance' && occurrences > 1 ? ` · Repeats weekly, ${occurrences} occurrences` : ''}</dd></div>
            <div><dt className="font-bold">Management unit</dt><dd className="mt-1">{scopeNodeId ? recipientGroupLabel(`node:${scopeNodeId}`, directory) : 'School-wide'}</dd></div>
            <div><dt className="font-bold">Attendees</dt><dd className="mt-1">{recipientGroups.join(', ')}{scopeNodeId && recipientRoots[0] ? ` (within ${recipientRoots[0].name})` : ''}</dd></div>
            {!isGeneralEvent && <div><dt className="font-bold">Attendance windows · Philippine time</dt><dd className="mt-1 space-y-1">{sortedWindows.map(window => <p key={window.id}>{formatClockTime(window.timeIn)}–{formatClockTime(window.timeOut)} · Late after {window.lateAfterMinutes} minutes</p>)}</dd></div>}
            <div><dt className="font-bold">Geofencing</dt><dd className="mt-1">{geofenceEnabled ? `${location.radius} m radius at ${location.lat}, ${location.lng}` : 'Disabled'}</dd></div>
            {!isGeneralEvent && !['service', 'merit'].includes(kind || '') && <div><dt className="font-bold">Sanctions</dt><dd className="mt-1">Late: {lateSanction.value} {lateSanction.unit}; absent: {absentSanction.value} {absentSanction.unit}</dd></div>}
            {!isGeneralEvent && !['service', 'merit'].includes(kind || '') && <div><dt className="font-bold">Excuse submission</dt><dd className="mt-1">Advance submissions allowed; closes {excuseWindowDays} days after each activity ends. Supporting document and OSSA approval required.</dd></div>}
            {kind === 'merit' && <div><dt className="font-bold">Merit award</dt><dd className="mt-1">{meritHours} hours</dd></div>}
            {kind === 'service' && <div><dt className="font-bold">Excess service hours</dt><dd className="mt-1">{serviceOverflow === 'merit' ? 'Save as earned merit' : 'Not credited'}</dd></div>}
            {isCeremony && <div><dt className="font-bold">Ceremony attendance settings</dt><dd className="mt-1">{ceremony.exemptStudentIds.length} general exemptions · {Object.keys(ceremony.classWindows).length} class schedule overrides · {Object.values(ceremony.exemptStudentIdsByDate || {}).reduce((total, ids) => total + ids.length, 0)} date-specific exemptions. Volunteer merit: {ceremony.allowVolunteerMerit ? `${ceremony.volunteerMeritHours} hours` : 'Disabled'}.</dd></div>}
          </dl>
          {!formValid && <ErrorNotice error="The form is not ready to save. Go back to check the configuration and your assigned unit." />}
        </Surface>}

        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-sm font-bold text-brand-900 dark:text-white">{isEditing ? isCeremony ? 'Ceremony actions' : 'Event actions' : phase < 4 ? `Phase ${phase + 1}: ${phases[phase]}` : 'Ready to schedule?'}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{isEditing ? 'Save your changes or update this event’s status.' : phase < 4 ? 'Complete this phase, then continue. Your entries are kept when you go back.' : isCeremony ? 'Review the selected dates and ceremony attendance requirements.' : 'Review the configuration before scheduling this event.'}</p></div>
          <div aria-label={isCeremony ? 'Ceremony form actions' : 'Event form actions'} className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end" role="group">
            {!isEditing && <Button className="sm:w-auto" type="button" variant="secondary" disabled={saving} onClick={() => back(returnPath)}>Cancel</Button>}
            {phasedCreation && phase > 0 && <Button className="sm:w-auto" type="button" variant="secondary" disabled={saving} onClick={() => goToPhase(phase - 1)}>Back</Button>}
            {phasedCreation && phase < phases.length - 1 && <Button className="sm:w-auto" type="submit" variant="gold">Next: {phases[phase + 1]}</Button>}
            {!organization && eventInScope && editingEvent?.status === 'active' && <><Button className="sm:w-auto" size="sm" type="button" variant="secondary" disabled={hasRecordedAttendance} onClick={async () => { await appData.updateEvent(editingEvent.id, { endTime: editingEvent.endTime + 3600000 }); navigate(returnPath, { replace: true }); }}><Clock3 size={15}/>Extend by 1 Hour</Button><Button className="sm:w-auto" size="sm" type="button" variant="secondary" onClick={async () => { await appData.archiveEvent(editingEvent.id); navigate(returnPath, { replace: true }); }}><Archive size={15}/>Finish and Archive</Button></>}
            {!organization && eventInScope && editingEvent?.status === 'upcoming' && <><Button className="sm:w-auto" size="sm" type="submit" variant="secondary"><Clock3 size={15}/>Reschedule</Button><Button className="sm:w-auto" size="sm" type="button" variant="warning" onClick={async () => { await appData.updateEvent(editingEvent.id, { status: 'done', cancellationStatus: 'dropped' }); navigate(returnPath, { replace: true }); }}><CircleOff size={15}/>Drop</Button><Button className="sm:w-auto" size="sm" type="button" variant="secondary" onClick={async () => { await appData.cancelEvent(editingEvent.id); navigate(returnPath, { replace: true }); }}><XCircle size={15}/>Cancel</Button><Button className="sm:w-auto" size="sm" type="button" variant="secondary" onClick={async () => { await appData.archiveEvent(editingEvent.id); navigate(returnPath, { replace: true }); }}><Archive size={15}/>Archive</Button><Button className="text-red-700 sm:w-auto" size="sm" type="button" variant="danger" onClick={async () => { await appData.deleteEvent(editingEvent.id); navigate(returnPath, { replace: true }); }}><Trash2 size={15}/>Delete</Button></>}
            {(!phasedCreation || phase === phases.length - 1) && <Button className="col-span-2 sm:ml-2 sm:w-auto sm:min-w-32" type="submit" variant="gold" loading={saving} disabled={!formValid || saving}><SaveIcon size={16}/>{requiresApproval ? isEditing ? 'Submit Changes for Approval' : 'Submit for OSSA Approval' : isEditing ? 'Save' : isCeremony ? 'Schedule Ceremonies' : kind === 'service' ? 'Schedule Service' : kind === 'merit' ? 'Schedule Merit Activity' : 'Schedule Event'}</Button>}
          </div>
        </div>
      </form>
    </Page>
  );
};

export default ActivityForm;
