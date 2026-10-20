import { educationalUnit } from '../lib/educationalUnit';
import { selectUploadFile } from '../lib/fileUploads';
import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { usePageMemory } from '../components/usePageMemory';
import { excuseBlockReason, excuseFileError, EXCUSE_FILE_ACCEPT } from '../lib/excusePolicy';
import { ExcuseWindowNotice, useExcuseClock } from '../components/events/ExcuseWindowNotice';
import { formatManilaTime, formatManilaDate, formatClockTime } from '../lib/dateTime';
import { useNavigate } from 'react-router-dom';
import EventLocationDetails from '../components/events/EventLocationDetails';
import EventBanner from '../components/events/EventBanner';
import { EventGroups } from '../components/events/EventGroups';
import { eventDisplayTitle, eventSectionRoots } from '../lib/eventGroups';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../components/AuthContext';
import { AppEvent } from '../types';
import { appData, uploadDocument } from '../lib/backend';
import { Modal } from '../components/ui/Modal';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Collapsible } from '../components/ui/Collapsible';
import CustomSelect from '../components/ui/CustomSelect';
import SearchInput from '../components/ui/SearchInput';
import { 
  Calendar, Filter, MapPin, Clock, AlertTriangle,
  ChevronDown, FileUp, CheckCircle2, ArrowRight,
  Send, FileText
} from 'lucide-react';


const StudentEvents: React.FC = () => {
  const navigate = useNavigate();
  const { profile, revision } = useAuth();
  
  // UI States
  const [searchTerm, setSearchTerm] = usePageMemory('searchTerm', '');
  const [statusFilter, setStatusFilter] = usePageMemory<'all' | 'active' | 'upcoming' | 'done'>('statusFilter', 'all');
  
  // Section Collapsible Toggles (Default: Scheduled & Archived Collapsed)
  const [isScheduledOpen, setIsScheduledOpen] = usePageMemory('isScheduledOpen', false);
  const [isArchivedOpen, setIsArchivedOpen] = usePageMemory('isArchivedOpen', false);

  // Modal States
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [showExcuseModal, setShowExcuseModal] = useState(false);

  const now = useExcuseClock();

  // Excuse Form State
  const [excuseReason, setExcuseReason] = useState('Medical / Health Condition');
  const [excuseDetails, setExcuseDetails] = useState('');
  const [excuseContact, setExcuseContact] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewName, setFilePreviewName] = useState<string>('');
  const [submittedExcuse, setSubmittedExcuse] = useState(false);
  const [excuseError, setExcuseError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load the current recipient events from the authorized snapshot.
  const allEvents = useMemo(() => profile ? appData.getRecipientEvents(profile.uid) : [], [profile, revision]);

  // Filtered lists
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      const matchesSearch = eventDisplayTitle(event, allEvents).toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (event.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' ? true : event.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allEvents, searchTerm, statusFilter]);

  // Group events into categories
  const activeEvents = useMemo(() => eventSectionRoots(filteredEvents).filter(e => e.status === 'active'), [filteredEvents]);
  const scheduledEvents = useMemo(() => eventSectionRoots(filteredEvents).filter(e => e.status === 'upcoming'), [filteredEvents]);
  const archivedEvents = useMemo(() => eventSectionRoots(filteredEvents).filter(e => e.status === 'done'), [filteredEvents]);

  const canFileExcuse = (event: AppEvent) => !event.isGeneralEvent && !event.cancellationStatus && !['service', 'merit'].includes(event.kind || '');
  const blockReason = (event: AppEvent, at = now) => excuseBlockReason(event, appData.getExcuseApplications(), profile?.uid || '', Boolean(profile && appData.isUserScopeFrozen(profile)), at);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = selectUploadFile(e.currentTarget)!;
      setSelectedFile(file);
      setFilePreviewName(file.name);
    }
  };

  const handleExcuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || !profile || submitting) return;
    const validationError = blockReason(selectedEvent, Date.now()) || (excuseDetails.trim().length < 10 ? 'Enter at least 10 characters of explanation.' : '') || excuseFileError(selectedFile);
    if (validationError) { setExcuseError(validationError); return; }
    setSubmitting(true); setExcuseError('');
    try {
      const proof = await uploadDocument(selectedFile!, 'excuses');
      await appData.submitExcuseApplication({ event_id: selectedEvent.id, reason: excuseDetails, contact_mobile: excuseContact.trim() || undefined, category: /medical|health/i.test(excuseReason) ? 'medical' : /emergency/i.test(excuseReason) ? 'emergency' : /academic|official/i.test(excuseReason) ? 'institutional' : 'personal', proof_url: proof });
      setSubmittedExcuse(true);
    } catch (error) { setExcuseError(errorMessage(error)); }
    finally { setSubmitting(false); }
  };

  return (
    <Page className="max-w-6xl animate-in fade-in duration-fast">
      
      {/* HEADER & FILTERS */}
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Calendar size={14} /> Campus Calendar</span>}
        title="Institutional Events"
        description="Review active mandatory assemblies, scheduled activities, and archived events."
      />

      {/* SEARCH & FILTER BAR */}
      <Surface aria-label="Event filters" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <SearchInput ariaLabel="Search events" className="flex-1" onChange={setSearchTerm} placeholder="Search event name..." value={searchTerm} />

          <div className="flex min-w-0 items-center gap-1.5 sm:w-56">
            <Filter className="text-slate-400 shrink-0" size={14} />
            <CustomSelect className="min-w-0 flex-1" label="Status" onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={[{ value: 'all', label: 'All Statuses' }, { value: 'active', label: 'Active Only' }, { value: 'upcoming', label: 'Upcoming Only' }, { value: 'done', label: 'Done Only' }]} value={statusFilter} />
          </div>
      </Surface>

      {/* 1. ACTIVE / ONGOING EVENTS (ALWAYS ON TOP) */}
      <Surface className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col items-start gap-2 border-b border-slate-200 pb-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h2 className="text-xs font-bold text-brand-900 dark:text-slate-100 uppercase tracking-wider">Active & Ongoing ({activeEvents.length})</h2>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full uppercase">Check-In Open</span>
        </div>

        {activeEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeEvents.map(event => event.isGeneralEvent ? <EventGroups key={event.id} events={allEvents} groupIds={[event.id]} onOpen={target => target.isGeneralEvent ? navigate(`/student/events/${target.id}`) : setSelectedEvent(target)} /> : (
              <button
                type="button"
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="group relative w-full overflow-hidden rounded-2xl border border-gold-400/40 bg-brand-900 p-4 text-left text-white shadow-md transition-all hover:border-gold-400"
              >
                {event.bannerUrl && <EventBanner src={event.bannerUrl} alt={`${event.title} banner`} />}
                <div className="absolute top-0 right-0 bg-gold-gradient text-brand-900 font-extrabold text-[8px] uppercase px-3 py-1 rounded-bl-xl shadow-xs tracking-wider">
                  Live Event
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gold-400/20 border border-gold-400/40 flex items-center justify-center text-gold-300 shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="pr-12 text-sm font-bold tracking-tight text-white transition-colors [overflow-wrap:anywhere] group-hover:text-gold-300">
                      {eventDisplayTitle(event, allEvents)}
                    </h3>
                    <p className="text-slate-300 text-[11px] font-medium line-clamp-2 mt-0.5">
                      {event.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-gold-300 font-bold">
                    <Clock size={12} />
                    <span>Ends: {formatManilaTime(event.endTime, { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-red-300 font-bold">
                    <AlertTriangle size={12} />
                    <span>Penalty: {event.penaltyValue} {event.penaltyUnit}</span>
                  </div>

                  <span className="text-[9px] font-bold text-gold-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Details <ArrowRight size={10} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-slate-400 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            No active events in session right now.
          </div>
        )}
      </Surface>

      {/* 2. SCHEDULED EVENTS (COLLAPSED BY DEFAULT WITH ANIMATION) */}
      <Surface className="overflow-hidden shadow-sm transition-all">
        <button
          aria-controls="scheduled-events-panel"
          aria-expanded={isScheduledOpen}
          type="button"
          onClick={() => setIsScheduledOpen(!isScheduledOpen)}
          className="flex w-full items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900 sm:p-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-900 dark:text-brand-300 flex items-center justify-center font-bold">
              <Calendar size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">Scheduled Upcoming Events ({scheduledEvents.length})</h2>
              <p className="text-slate-400 dark:text-slate-400 text-[10px] font-medium">Click to expand or collapse future assemblies</p>
            </div>
          </div>
          <div className="app-disclosure-chevron shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-brand-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <ChevronDown size={18} />
          </div>
        </button>

        <Collapsible id="scheduled-events-panel" open={isScheduledOpen} innerClassName="space-y-4 p-4 sm:p-6">
            {scheduledEvents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scheduledEvents.map(event => event.isGeneralEvent ? <EventGroups key={event.id} events={allEvents} groupIds={[event.id]} onOpen={target => target.isGeneralEvent ? navigate(`/student/events/${target.id}`) : setSelectedEvent(target)} /> : (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="flex w-full flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-gold-400 hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-gold-400 dark:hover:bg-slate-800 sm:p-5"
                  >
                {event.bannerUrl && <EventBanner src={event.bannerUrl} alt={`${event.title} banner`} />}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-800 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/40 px-2.5 py-0.5 rounded-md">
                          Scheduled
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">
                          {formatManilaDate(event.startTime, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">{eventDisplayTitle(event, allEvents)}</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-2 mt-1">{event.description}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Clock size={12} /> {formatManilaTime(event.startTime, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-brand-900 dark:text-slate-100 font-bold hover:text-gold-600 dark:hover:text-gold-400 flex items-center gap-1">Details <ArrowRight size={12} /></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-wider py-4">No scheduled events found.</p>
            )}
        </Collapsible>
      </Surface>

      {/* 3. ARCHIVED EVENTS (ENDED OR CANCELLED - COLLAPSED BY DEFAULT) */}
      <Surface className="overflow-hidden shadow-sm transition-all">
        <button
          aria-controls="archived-events-panel"
          aria-expanded={isArchivedOpen}
          type="button"
          onClick={() => setIsArchivedOpen(!isArchivedOpen)}
          className="flex w-full items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900 sm:p-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">Archived Events ({archivedEvents.length})</h2>
              <p className="text-slate-400 dark:text-slate-400 text-[10px] font-medium">Past and cancelled campus events</p>
            </div>
          </div>
          <div className="app-disclosure-chevron shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-brand-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <ChevronDown size={18} />
          </div>
        </button>

        <Collapsible id="archived-events-panel" open={isArchivedOpen} innerClassName="space-y-4 p-4 sm:p-6">
            {archivedEvents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archivedEvents.map(event => event.isGeneralEvent ? <EventGroups key={event.id} events={allEvents} groupIds={[event.id]} onOpen={target => target.isGeneralEvent ? navigate(`/student/events/${target.id}`) : setSelectedEvent(target)} /> : (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left opacity-80 transition-all hover:border-slate-300 hover:opacity-100 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600 sm:p-5"
                  >
                {event.bannerUrl && <EventBanner src={event.bannerUrl} alt={`${event.title} banner`} />}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {event.status}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {formatManilaDate(event.startTime)}
                      </span>
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">{eventDisplayTitle(event, allEvents)}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{event.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-wider py-4">No archived events.</p>
            )}
        </Collapsible>
      </Surface>

      {/* EVENT DETAIL MODAL PANEL */}
      {selectedEvent ? (
        <Modal
          open
          onClose={() => setSelectedEvent(null)}
          title={eventDisplayTitle(selectedEvent, allEvents)}
          description={`Review this ${selectedEvent.status} event's schedule, sanction, and geofence.`}
          size="lg"
          footer={canFileExcuse(selectedEvent) ? (
            <>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:mr-auto sm:self-center">
                {blockReason(selectedEvent) || 'Unable to attend this assembly?'}
              </p>
              <button
                disabled={Boolean(blockReason(selectedEvent))}
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
            {canFileExcuse(selectedEvent) && <ExcuseWindowNotice event={selectedEvent} blocked={blockReason(selectedEvent)} />}
            {selectedEvent.bannerUrl && <EventBanner src={selectedEvent.bannerUrl} alt={`${selectedEvent.title} banner`} />}
            <span className="inline-flex rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gold-700 dark:border-gold-400/30 dark:bg-gold-400/10 dark:text-gold-300">
              {selectedEvent.status} Event
            </span>
              {selectedEvent.isGeneralEvent && <p className="text-sm">Attendance is recorded for the specific events listed under this general event.</p>}
              {selectedEvent.venue && <p><b>Location:</b> {selectedEvent.venue}</p>}
              {selectedEvent.attendanceWindows?.map((window, index) => <p key={window.id}>{window.label || `Window ${index + 1}`}: {formatClockTime(window.timeIn)} – {formatClockTime(window.timeOut)} · Late after {window.lateAfterMinutes} minutes</p>)}
              <EventLocationDetails event={selectedEvent} />
              {/* Description */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1">Full Description</h4>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                  {selectedEvent.description}
                </p>
              </div>

              {/* Time & Penalty Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-900 dark:text-brand-300 flex items-center justify-center font-bold">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Event Schedule</p>
                    <p className="text-xs font-bold text-brand-900 dark:text-slate-100">
                      {formatManilaTime(selectedEvent.startTime, { hour: '2-digit', minute: '2-digit' })} - {formatManilaTime(selectedEvent.endTime, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-100 dark:border-red-900/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-red-400 dark:text-red-300 uppercase tracking-widest">Unexcused Sanction Penalty</p>
                    <p className="text-xs font-black text-red-700 dark:text-red-400">
                      {selectedEvent.penaltyValue} {selectedEvent.penaltyUnit}
                    </p>
                  </div>
                </div>
              </div>

              {/* Geofencing Location Map Preview */}
              <div>
                <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <MapPin size={12} className="text-gold-600 dark:text-gold-400" /> Geofence Verification Zone
                  </h4>
                  <span className="max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 [overflow-wrap:anywhere] dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Radius: {selectedEvent.location?.radius_meters || 300}m
                  </span>
                </div>

                <div className="relative h-44 rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center shadow-inner">
                  {/* Mock Map Background Grid */}
                  <div className="absolute inset-0 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-70"></div>
                  
                  {/* Center Marker */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-brand-900 border-2 border-gold-400 shadow-xl flex items-center justify-center text-gold-400 animate-bounce">
                      <MapPin size={18} />
                    </div>
                    <span className="mt-1 text-[10px] font-black bg-brand-900 text-white px-2.5 py-0.5 rounded-full shadow-md uppercase">
                      {educationalUnit.name || 'Event location'}
                    </span>
                  </div>

                  {/* Geofence Circle Overlay */}
                  <div className="absolute w-36 h-36 rounded-full border-2 border-dashed border-gold-500 bg-gold-400/10 flex items-center justify-center animate-pulse"></div>
                </div>
              </div>
          </div>
        </Modal>
      ) : null}

      {/* EXCUSE FILING SECONDARY MODAL PANEL */}
      {selectedEvent && canFileExcuse(selectedEvent) ? (
        <Modal
          open={showExcuseModal}
          onClose={() => setShowExcuseModal(false)}
          title={`File Excuse Application — ${selectedEvent.title}`}
          description="Submit a formal absence request and supporting documentation for committee review."
          size="md"
          closeOnBackdrop={!submittedExcuse}
          footer={!submittedExcuse ? (
            <button
              aria-label="Submit formal excuse"
              type="submit"
              disabled={submitting || Boolean(blockReason(selectedEvent))}
              form="event-excuse-form"
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
                <h4 className="text-lg font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight">Excuse Letter Submitted!</h4>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Your application for <span className="font-bold text-brand-900 dark:text-slate-200">{selectedEvent.title}</span> has been forwarded to the OSSA for review. Your absence is excused only after approval.
                </p>
              </div>
            ) : (
              <form id="event-excuse-form" onSubmit={handleExcuseSubmit} className="space-y-4">
                <ExcuseWindowNotice event={selectedEvent} blocked={blockReason(selectedEvent)} />
                {excuseError && <ErrorNotice error={excuseError} operation="Student Events"></ErrorNotice>}
                {/* Event Summary */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Target Event</p>
                  <p className="font-bold text-brand-900 dark:text-slate-100">{selectedEvent.title}</p>
                </div>

                {/* Reason Select */}
                <CustomSelect label="Excuse Reason" onChange={(value) => setExcuseReason(value as string)} options={[{ value: 'Medical / Health Condition', label: 'Medical / Health Condition' }, { value: 'Academic Conflict / Exam', label: 'Academic Conflict / Official Exam' }, { value: 'Family Emergency', label: 'Family Emergency' }, { value: 'Official Representation (Off-Campus)', label: 'Official School Off-Campus Event' }]} value={excuseReason} />

                {/* Details textarea */}
                <div className="space-y-1">
                  <label htmlFor="event-excuse-details" className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Detailed Explanation</label>
                  <textarea
                    id="event-excuse-details"
                    rows={3}
                    required
                    minLength={10}
                    placeholder="Provide detailed justification for absence..."
                    value={excuseDetails}
                    onChange={(e) => setExcuseDetails(e.target.value)}
                    className="input-field min-h-[90px] font-medium"
                  />
                </div>

                {/* File Upload Component */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Attach Excuse Letter / Medical Certificate</span>
                  <label htmlFor="event-excuse-file" className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-gold-400 bg-slate-50 dark:bg-slate-900/50 transition-colors">
                    <FileUp size={24} className="text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-brand-900 dark:text-slate-200">
                      {filePreviewName ? filePreviewName : 'Click or Drag File to Upload'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Required: PDF, JPG, PNG, WebP up to 5 MB</span>
                    <input aria-label="Attach Excuse Letter / Medical Certificate" id="event-excuse-file" type="file" aria-required="true" accept={EXCUSE_FILE_ACCEPT} onChange={handleFileChange} className="sr-only" />
                  </label>
                </div>

                {/* Contact phone */}
                <div className="space-y-1">
                  <label htmlFor="event-excuse-contact" className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Guardian / Contact Mobile Number</label>
                  <input
                    id="event-excuse-contact"
                    type="tel"
                    placeholder="e.g. 0917 123 4567"
                    value={excuseContact}
                    onChange={(e) => setExcuseContact(e.target.value)}
                    className="input-field"
                  />
                </div>

              </form>
            )}
        </Modal>
      ) : null}

    </Page>
  );
};

export default StudentEvents;
