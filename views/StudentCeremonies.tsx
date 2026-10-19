import { selectUploadFile } from '../lib/fileUploads';
import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { usePageMemory } from '../components/usePageMemory';
import { excuseBlockReason, excuseFileError, EXCUSE_FILE_ACCEPT } from '../lib/excusePolicy';
import { ExcuseWindowNotice, useExcuseClock } from '../components/events/ExcuseWindowNotice';
import { formatManilaDate, formatManilaTime } from '../lib/dateTime';
import ActivityApprovalQueue from '../components/events/ActivityApprovalQueue';
import { appData, uploadDocument } from '../lib/backend';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { hasPermission } from '../lib/accessControl';
import { canManageEventInScope, isCeremonyVolunteer } from '../lib/eventAudience';
import { CeremonyCalendar } from '../components/events/CeremonyCalendar';
import { manilaDate } from '../lib/ceremonySchedule';
import { useAuth } from '../components/AuthContext';
import { Modal } from '../components/ui/Modal';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Collapsible } from '../components/ui/Collapsible';
import CustomSelect from '../components/ui/CustomSelect';
import SearchInput from '../components/ui/SearchInput';
import { Award, Filter, MapPin, Clock, FileUp, CheckCircle2, ArrowRight, Flag, Calendar, Send, ChevronDown, FileText } from 'lucide-react';

interface SchoolCeremony {
  event: import('../types').AppEvent;
  id: string;
  title: string;
  type: 'flag_raising' | 'flag_retreat';
  scheduleDay: string;
  timeFrame: string;
  locationName: string;
  geofenceEnabled: boolean;
  date: string;
  canEdit: boolean;
  required: boolean;
  volunteerMerit: number;
  geofenceRadius: number; // in meters
  attire: string;
  description: string;
  penaltyValue: number;
  status: 'active' | 'scheduled' | 'archived';
}

const StudentCeremonies: React.FC = () => {
  const { profile, revision } = useAuth();
  const navigate = useNavigate();
  const canManage = Boolean(profile && hasPermission(profile.role, 'events.manage'));

  // Search & Filter state
  const [searchTerm, setSearchTerm] = usePageMemory('searchTerm', '');
  const [typeFilter, setTypeFilter] = usePageMemory<string>('typeFilter', 'all');
  const [isScheduledOpen, setIsScheduledOpen] = usePageMemory('isScheduledOpen', false);
  const [isArchivedOpen, setIsArchivedOpen] = usePageMemory('isArchivedOpen', false);

  // Modal State
  const [selectedCeremony, setSelectedCeremony] = useState<SchoolCeremony | null>(null);
  const [showExcuseModal, setShowExcuseModal] = useState(false);

  const now = useExcuseClock();

  // Excuse Form State
  const [excuseReason, setExcuseReason] = useState('Official Academic Conflict');
  const [excuseDetails, setExcuseDetails] = useState('');
  const [excuseContact, setExcuseContact] = useState('');
  const [filePreviewName, setFilePreviewName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submittedExcuse, setSubmittedExcuse] = useState(false);
  const [excuseError, setExcuseError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredCeremonies = useMemo(() => {
    const events = profile
      ? canManage || ['ossa', 'ossa_staff'].includes(profile.role) ? appData.getVisibleEvents(profile.uid) : appData.getEvents().filter(event => appData.isEventRecipient(event, profile) || isCeremonyVolunteer(event, profile, appData.getSchoolStructure()))
      : [];
    const ceremonies: SchoolCeremony[] = events.filter(event => event.kind === 'flag_ceremony' && !event.cancellationStatus && event.approvalStatus !== 'pending' && event.approvalStatus !== 'rejected').map(event => ({
      event, id: event.id, title: event.title, required: Boolean(profile && appData.isEventRecipient(event, profile)), volunteerMerit: event.ceremony?.allowVolunteerMerit ? event.ceremony.volunteerMeritHours : 0, date: manilaDate(event.startTime), geofenceEnabled: event.geofenceEnabled !== false, canEdit: canManage && canManageEventInScope(profile, event, appData.getSchoolStructure()) && event.status !== 'done', type: event.ceremony?.flagKind === 'retreat' ? 'flag_retreat' : 'flag_raising', scheduleDay: formatManilaDate(event.startTime, { timeZone: 'Asia/Manila' }),
      timeFrame: `${formatManilaTime(event.startTime, { timeZone: 'Asia/Manila' })} - ${formatManilaTime(event.endTime, { timeZone: 'Asia/Manila' })}`,
      locationName: event.geofenceEnabled ? 'Designated event area' : 'See event instructions', geofenceRadius: event.location.radius_meters,
      attire: 'See event instructions', description: event.description || '', penaltyValue: event.penaltyUnit === 'minutes' ? event.penaltyValue / 60 : event.penaltyValue,
      status: event.status === 'upcoming' ? 'scheduled' : event.status === 'done' ? 'archived' : 'active',
    }));
    return ceremonies.filter(ceremony => {
      const matchesSearch = ceremony.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            ceremony.locationName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'all' ? true : ceremony.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [searchTerm, typeFilter, profile, revision]);

  const activeCeremonies = useMemo(
    () => filteredCeremonies.filter(ceremony => ceremony.status === 'active'),
    [filteredCeremonies]
  );
  const scheduledCeremonies = useMemo(
    () => filteredCeremonies.filter(ceremony => ceremony.status === 'scheduled'),
    [filteredCeremonies]
  );
  const archivedCeremonies = useMemo(
    () => filteredCeremonies.filter(ceremony => ceremony.status === 'archived'),
    [filteredCeremonies]
  );

  const canFileExcuse = (ceremony: SchoolCeremony) => Boolean(ceremony.required && profile && ['student', 'mayor', 'ssg'].includes(profile.role));
  const blockReason = (ceremony: SchoolCeremony, at = now) => excuseBlockReason(ceremony.event, appData.getExcuseApplications(), profile?.uid || '', Boolean(profile && appData.isUserScopeFrozen(profile)), at);

  const renderCeremonyCard = (ceremony: SchoolCeremony) => (
    <button
      type="button"
      key={ceremony.id}
      onClick={() => setSelectedCeremony(ceremony)}
      className={`app-surface group relative flex w-full flex-col justify-between overflow-hidden p-4 text-left shadow-xs transition-all hover:shadow-md sm:p-5 ${
        ceremony.status === 'active'
          ? 'border-emerald-300 hover:border-emerald-400 dark:border-emerald-800'
          : ceremony.status === 'archived'
            ? 'opacity-80 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-600'
            : 'hover:border-gold-400/60'
      }`}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-gold-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300">
          <Flag size={10} /> {ceremony.type.replace('_', ' ')}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
          ceremony.status === 'active'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-400'
            : ceremony.status === 'scheduled'
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300'
              : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }`}>
          {ceremony.status === 'active'
            ? ceremony.geofenceEnabled ? `Geofence Active (${ceremony.geofenceRadius}m)` : 'Active - No geofence'
            : ceremony.status === 'scheduled'
              ? 'Scheduled'
              : 'Archived'}
        </span>
      </div>

      <div>
        {!ceremony.required && !canManage && <p className="mb-2 text-xs font-bold text-blue-700 dark:text-blue-300">{ceremony.volunteerMerit > 0 ? `Optional attendance - Up to ${ceremony.volunteerMerit} merit hours after scan-out` : 'Optional attendance - No merit award'}</p>}
        <h3 className="text-sm font-bold uppercase tracking-tight text-brand-900 [overflow-wrap:anywhere] transition-colors group-hover:text-gold-600 dark:text-slate-100 dark:group-hover:text-gold-400">
          {ceremony.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {ceremony.description}
        </p>
      </div>

      <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-slate-700 dark:text-slate-300">
          <span className="flex min-w-0 items-center gap-1.5 text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100"><Calendar size={14} className="shrink-0 text-gold-500" /> {ceremony.scheduleDay}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100"><Clock size={14} className="shrink-0 text-gold-500" /> {ceremony.timeFrame}</span>
        </div>
        <div className="flex flex-col items-start gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-start gap-1 [overflow-wrap:anywhere]"><MapPin size={12} className="mt-0.5 shrink-0" /> {ceremony.locationName}</span>
          <span className="flex shrink-0 items-center gap-1 font-bold text-brand-900 transition-transform group-hover:translate-x-1 dark:text-slate-100">Rules <ArrowRight size={12} /></span>
        </div>
      </div>
    </button>
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = selectUploadFile(e.currentTarget)!;
      setFilePreviewName(file.name);
      setSelectedFile(file);
    }
  };

  const handleExcuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCeremony || !profile || submitting) return;
    const validationError = blockReason(selectedCeremony, Date.now()) || (excuseDetails.trim().length < 10 ? 'Enter at least 10 characters of explanation.' : '') || excuseFileError(selectedFile);
    if (validationError) { setExcuseError(validationError); return; }
    setSubmitting(true); setExcuseError('');
    try {
      const proof = await uploadDocument(selectedFile!, 'excuses');
      await appData.submitExcuseApplication({ event_id: selectedCeremony.id, reason: excuseDetails, contact_mobile: excuseContact.trim() || undefined, category: /medical|health/i.test(excuseReason) ? 'medical' : /emergency/i.test(excuseReason) ? 'emergency' : /academic|official/i.test(excuseReason) ? 'institutional' : 'personal', proof_url: proof });
      setSubmittedExcuse(true);
    } catch (error) { setExcuseError(errorMessage(error)); }
    finally { setSubmitting(false); }
  };

  return (
    <Page className="max-w-6xl animate-in fade-in duration-fast">
      
      {/* HEADER & FILTERS */}
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Award size={14} /> Official Protocol</span>}
        title="Institutional Ceremonies"
        description="Flag ceremony schedules, attendance requirements, and optional geofenced check-in."
        actions={canManage ? <Button onClick={() => navigate('/ssg/ceremonies/create')}>Create Ceremony</Button> : undefined}
      />

      {/* SEARCH & FILTER */}
      <ActivityApprovalQueue purpose="ceremony" />
      <Surface aria-label="Ceremony filters" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <SearchInput ariaLabel="Search ceremonies" className="flex-1" onChange={setSearchTerm} placeholder="Search ceremony..." value={searchTerm} />

          <div className="flex min-w-0 items-center gap-1.5 sm:w-56">
            <Filter className="text-slate-400 shrink-0" size={14} />
            <CustomSelect className="min-w-0 flex-1" label="Ceremony type" onChange={(value) => setTypeFilter(value as string)} options={[{ value: 'all', label: 'All Ceremonies' }, { value: 'flag_raising', label: 'Flag Raising' }, { value: 'flag_retreat', label: 'Flag Retreat' }]} value={typeFilter} />
          </div>
      </Surface>

      <CeremonyCalendar dates={filteredCeremonies.map(ceremony => ceremony.date)} />

      {/* 1. ACTIVE / ONGOING CEREMONIES */}
      <Surface className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col items-start gap-2 border-b border-slate-200 pb-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-900 dark:text-slate-100">Active & Ongoing ({activeCeremonies.length})</h2>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-600 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-400">Check-In Open</span>
        </div>
        {activeCeremonies.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{activeCeremonies.map(renderCeremonyCard)}</div>
        ) : (
          <p className="py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-400">No ongoing ceremonies right now.</p>
        )}
      </Surface>

      {/* 2. SCHEDULED CEREMONIES */}
      <Surface className="overflow-hidden shadow-sm transition-all">
        <button type="button" aria-controls="scheduled-ceremonies-panel" aria-expanded={isScheduledOpen} onClick={() => setIsScheduledOpen(!isScheduledOpen)} className="flex w-full items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-300"><Calendar size={18} /></div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">Scheduled Upcoming Ceremonies ({scheduledCeremonies.length})</h2>
              <p className="text-[10px] font-medium text-slate-400">Click to expand or collapse future ceremonies</p>
            </div>
          </div>
          <div className="app-disclosure-chevron shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-brand-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><ChevronDown size={18} /></div>
        </button>
        <Collapsible id="scheduled-ceremonies-panel" open={isScheduledOpen} innerClassName="p-4 sm:p-6">
            {scheduledCeremonies.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{scheduledCeremonies.map(renderCeremonyCard)}</div> : <p className="py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-400">No scheduled ceremonies found.</p>}
        </Collapsible>
      </Surface>

      {/* 3. ARCHIVED CEREMONIES */}
      <Surface className="overflow-hidden shadow-sm transition-all">
        <button type="button" aria-controls="archived-ceremonies-panel" aria-expanded={isArchivedOpen} onClick={() => setIsArchivedOpen(!isArchivedOpen)} className="flex w-full items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"><FileText size={18} /></div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">Archived Ceremonies ({archivedCeremonies.length})</h2>
              <p className="text-[10px] font-medium text-slate-400">Past institutional ceremonies</p>
            </div>
          </div>
          <div className="app-disclosure-chevron shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-brand-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><ChevronDown size={18} /></div>
        </button>
        <Collapsible id="archived-ceremonies-panel" open={isArchivedOpen} innerClassName="p-4 sm:p-6">
            {archivedCeremonies.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{archivedCeremonies.map(renderCeremonyCard)}</div> : <p className="py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-400">No archived ceremonies.</p>}
        </Collapsible>
      </Surface>

      {/* CEREMONY DETAIL MODAL */}
      {selectedCeremony ? (
        <Modal
          open
          onClose={() => setSelectedCeremony(null)}
          title={selectedCeremony.title}
          description="Review the ceremony schedule, instructions, and check-in requirements."
          size="lg"
          footer={selectedCeremony.canEdit ? <Button onClick={() => navigate(`/ssg/ceremonies/${selectedCeremony.id}/edit`)}>Edit Ceremony</Button> : canFileExcuse(selectedCeremony) ? (
            <>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:mr-auto sm:self-center">
                {blockReason(selectedCeremony) || 'Cannot participate in this official ceremony?'}
              </p>
              <button
                disabled={Boolean(blockReason(selectedCeremony))}
                aria-label="File for excuse"
                onClick={() => { setSubmittedExcuse(false); setExcuseError(''); setExcuseDetails(''); setExcuseContact(''); setSelectedFile(null); setFilePreviewName(''); setShowExcuseModal(true); }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl app-button--gold px-6 py-3 text-xs font-black uppercase tracking-widest text-brand-900 shadow-lg transition-all hover:brightness-110 active:scale-95 sm:w-auto"
                type="button"
              >
              <FileUp size={16} /> Excuse
              </button>
            </>
          ) : undefined}
        >
          <div className="space-y-5">
            {canFileExcuse(selectedCeremony) && <ExcuseWindowNotice event={selectedCeremony.event} blocked={blockReason(selectedCeremony)} />}
            <span className="inline-flex rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gold-700 dark:border-gold-400/30 dark:bg-gold-400/10 dark:text-gold-300">
              {selectedCeremony.type.replace('_', ' ')}
            </span>
              <div>
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1">Ceremony Overview</h4>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 leading-relaxed">
                  {selectedCeremony.description}
                </p>
              </div>

              {/* Grid Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Day & Timeframe</p>
                  <p className="text-xs font-bold text-brand-900 dark:text-slate-100">{selectedCeremony.scheduleDay}</p>
                  <p className="text-xs font-bold text-gold-600 dark:text-gold-400">{selectedCeremony.timeFrame}</p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Dress Code & Protocol</p>
                  <p className="text-xs font-bold text-brand-900 dark:text-slate-100">{selectedCeremony.attire}</p>
                </div>
              </div>

              {/* Geofencing Location Map */}
              <div>
                <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">
                    <MapPin size={12} className="text-gold-600 dark:text-gold-400" /> Check-in location
                  </h4>
                  <span className="max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 [overflow-wrap:anywhere] dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {selectedCeremony.geofenceEnabled ? `Perimeter Radius: ${selectedCeremony.geofenceRadius}m` : 'Geofencing is disabled for this ceremony.'}
                  </span>
                </div>

                <p className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">{selectedCeremony.geofenceEnabled ? 'Attendance must be scanned within the configured perimeter. See the ceremony instructions for the venue.' : 'See the ceremony instructions for the venue. GPS verification is not required.'}</p>
              </div>
          </div>
        </Modal>
      ) : null}

      {/* EXCUSE FILING MODAL */}
      {selectedCeremony && canFileExcuse(selectedCeremony) ? (
        <Modal
          open={showExcuseModal}
          onClose={() => setShowExcuseModal(false)}
          title={`Excuse Letter Submission — ${selectedCeremony.title}`}
          description="Transmit an exemption letter and supporting document for discipline approval."
          size="md"
          closeOnBackdrop={!submittedExcuse}
          footer={!submittedExcuse ? (
            <button
              aria-label="Transmit exemption letter"
              type="submit"
              disabled={submitting || Boolean(blockReason(selectedCeremony))}
              form="ceremony-excuse-form"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold-400/30 bg-brand-900 px-5 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-brand-800 active:scale-98 sm:w-auto"
            >
            <Send size={16} className="text-gold-400" /> Submit
            </button>
          ) : undefined}
        >
            {submittedExcuse ? (
              <div className="space-y-4 py-3 text-center">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <CheckCircle2 size={36} />
                </div>
                <h4 className="text-lg font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight">Exemption Form Transmitted!</h4>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Your exemption request for <span className="font-bold text-brand-900 dark:text-slate-100">{selectedCeremony.title}</span> has been logged for OSSA review. Your absence is excused only after approval.
                </p>
              </div>
            ) : (
              <form id="ceremony-excuse-form" onSubmit={handleExcuseSubmit} className="space-y-4">
                <ExcuseWindowNotice event={selectedCeremony.event} blocked={blockReason(selectedCeremony)} />
                {excuseError && <ErrorNotice error={excuseError} operation="Student Ceremonies"></ErrorNotice>}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Target Ceremony</p>
                  <p className="font-bold text-brand-900 dark:text-slate-100">{selectedCeremony.title}</p>
                </div>

                <CustomSelect label="Exemption Reason" onChange={(value) => setExcuseReason(value as string)} options={[{ value: 'Official Academic Conflict', label: 'Official Academic Conflict' }, { value: 'Medical / Health Condition', label: 'Medical / Health Reason' }, { value: 'Religious Observance', label: 'Religious Observance' }, { value: 'Official Off-Campus Event', label: 'Official Off-Campus Competition' }]} value={excuseReason} />

                <div className="space-y-1">
                  <label htmlFor="ceremony-excuse-details" className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Detailed Justification</label>
                  <textarea
                    id="ceremony-excuse-details"
                    rows={3}
                    required
                    minLength={10}
                    placeholder="Provide detailed explanation for ceremony absence..."
                    value={excuseDetails}
                    onChange={(e) => setExcuseDetails(e.target.value)}
                    className="input-field min-h-[90px] font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Upload Supporting Document / Excuse Letter</span>
                  <label htmlFor="ceremony-excuse-file" className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-gold-400 bg-slate-50 dark:bg-slate-900/50 transition-colors">
                    <FileUp size={24} className="text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-brand-900 dark:text-slate-200">
                      {filePreviewName ? filePreviewName : 'Upload Excuse Letter / Photo'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Required: PDF, JPG, PNG, WebP up to 5 MB</span>
                    <input aria-label="Upload Supporting Document / Excuse Letter" id="ceremony-excuse-file" type="file" aria-required="true" accept={EXCUSE_FILE_ACCEPT} onChange={handleFileChange} className="sr-only" />
                  </label>
                </div>
              </form>
            )}
        </Modal>
      ) : null}

    </Page>
  );
};

export default StudentCeremonies;
