import { hasPermission } from '../lib/accessControl';
import { usePageMemory } from '../components/usePageMemory';
import { formatManilaDateTime, formatClockTime } from '../lib/dateTime';
import EventLocationDetails from '../components/events/EventLocationDetails';
import EventBanner from '../components/events/EventBanner';
import { EventGroups } from '../components/events/EventGroups';
import { eventDisplayTitle, eventSectionRoots } from '../lib/eventGroups';
import ActivityApprovalQueue from '../components/events/ActivityApprovalQueue';
import { useAuth } from '../components/AuthContext';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Calendar, CalendarClock, ChevronDown, Clock, Plus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Collapsible } from '../components/ui/Collapsible';
import Button from '../components/ui/Button';
import CustomSelect from '../components/ui/CustomSelect';
import SearchInput from '../components/ui/SearchInput';
import { Modal } from '../components/ui/Modal';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { appData } from '../lib/backend';
import { canManageEventInScope } from '../lib/eventAudience';
import { AppEvent } from '../types';

type StatusFilter = 'all' | AppEvent['status'];
type GeofenceFilter = 'all' | 'enabled' | 'disabled';
const recipients = (event: AppEvent) => event.recipientGroups?.join(', ') || event.targetValue || (event.target?.all ? 'All Students' : event.participantsType);
const absentRule = (event: AppEvent) => event.sanctionRules?.absent || { value: event.penaltyValue, unit: event.penaltyUnit };

function EventCard({ event, kind, onOpen, onSelect }: { event: AppEvent; kind: 'active' | 'scheduled' | 'archived'; onOpen: () => void; onSelect: (event: AppEvent) => void }) {
  const navigate = useNavigate();
  if (event.isGeneralEvent) return <EventGroups events={appData.getEvents()} groupIds={[event.id]} onOpen={target => target.isGeneralEvent ? navigate(`/ssg/events/${target.id}`) : onSelect(target)} onAdd={parent => navigate(parent.organizationId ? `/organizations/${parent.organizationId}/events/create?parent=${parent.id}` : `/ssg/events/create?parent=${parent.id}`)} />;
  const dark = kind === 'active';
  const cardClass = `group relative flex min-w-0 flex-col rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md ${dark ? 'overflow-hidden border-gold-400/40 bg-brand-950 text-white' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60'}`;
  return <article aria-label={eventDisplayTitle(event, appData.getEvents())} className={cardClass}><button type="button" aria-label={`Open ${eventDisplayTitle(event, appData.getEvents())} details`} onClick={onOpen} className="flex h-full w-full flex-col p-5 text-left">
    {event.bannerUrl && <EventBanner src={event.bannerUrl} alt={`${event.title} banner`} />}
    {dark && <span className="absolute right-0 top-0 rounded-bl-xl bg-gold-gradient px-4 py-1.5 text-[9px] font-black uppercase text-brand-900">Live Event</span>}
    <div className="flex items-start gap-3 pr-14"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dark ? 'border border-gold-400/40 bg-gold-400/15 text-gold-300' : 'bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-300'}`}><Calendar size={19}/></span><span className="min-w-0"><span className={`block text-sm font-bold ${dark ? 'text-white' : 'text-brand-900 dark:text-white'}`}>{eventDisplayTitle(event, appData.getEvents())}</span><span className={`mt-1 line-clamp-2 block text-xs leading-5 ${dark ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{event.description || 'No event details provided.'}</span></span></div>
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs font-bold ${dark ? 'border-white/10' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}><span className="flex items-center gap-1.5"><Clock size={14}/> {kind === 'scheduled' ? 'Starts' : 'Ends'}: {formatManilaDateTime(kind === 'scheduled' ? event.startTime : event.endTime)}</span><span className="flex items-center gap-1.5"><AlertTriangle size={14}/> Penalty: {absentRule(event).value} {absentRule(event).unit}</span><span className="flex items-center gap-1.5"><Users size={14}/>{recipients(event)}</span></div>
  </button></article>;
}

function EventDetails({ event, onClose }: { event: AppEvent | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  if (!event) return null;
  return <Modal open onClose={onClose} title={eventDisplayTitle(event, appData.getEvents())} description={`${event.status === 'active' ? 'Active' : event.status === 'upcoming' ? 'Scheduled' : 'Archived'} event details`} size="lg">
    <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
      {event.bannerUrl && <EventBanner src={event.bannerUrl} alt={`${event.title} banner`} />}
      {event.status === 'done' && <p className="rounded-xl bg-slate-100 p-3 font-semibold dark:bg-slate-700">Read-only archived record</p>}
      {event.venue && <p><b>Location:</b> {event.venue}</p>}
      {event.attendanceWindows?.map((window, index) => <p key={window.id}>{window.label || `Window ${index + 1}`}: {formatClockTime(window.timeIn)} – {formatClockTime(window.timeOut)}</p>)}
      <p>{event.description || 'No event details provided.'}</p>
      <EventLocationDetails event={event} />
      <div className="grid gap-3 sm:grid-cols-2"><div><b>Starts</b><p>{formatManilaDateTime(event.startTime)}</p></div><div><b>Ends</b><p>{formatManilaDateTime(event.endTime)}</p></div><div><b>Recipients</b><p>{recipients(event)}</p></div><div><b>Geofence</b><p>{event.geofenceEnabled === false ? 'Disabled' : `${event.location.radius_meters} meters`}</p></div><div><b>Late sanction</b><p>{event.sanctionRules?.late.value || 0} {event.sanctionRules?.late.unit || 'minutes'}</p></div><div><b>Absent sanction</b><p>{absentRule(event).value} {absentRule(event).unit}</p></div></div>
      {event.status !== 'done' && canManageEventInScope(profile, event, appData.getSchoolStructure()) && <Button variant="gold" onClick={() => { onClose(); navigate(`/ssg/events/${event.id}/edit`); }}>Edit</Button>}
    </div>
  </Modal>;
}

export default function SSGEventCreation() {
  const navigate = useNavigate();
  const { profile, revision } = useAuth();
  const events = useMemo(() => profile ? appData.getVisibleEvents(profile.uid).filter(event => event.kind !== 'flag_ceremony') : [], [profile, revision]);
  const [search, setSearch] = usePageMemory('search', ''), [status, setStatus] = usePageMemory<StatusFilter>('status', 'all'), [audience, setAudience] = usePageMemory('audience', 'all'), [geofence, setGeofence] = usePageMemory<GeofenceFilter>('geofence', 'all');
  const [scheduledOpen, setScheduledOpen] = usePageMemory('scheduledOpen', false), [archivedOpen, setArchivedOpen] = usePageMemory('archivedOpen', false), [selected, setSelected] = useState<AppEvent | null>(null);
  useEffect(() => { setSelected(current => current ? events.find(event => event.id === current.id) || null : null); }, [events]);
  const audiences = useMemo(() => Array.from(new Set(events.flatMap(e => e.recipientGroups || [recipients(e)]))).filter(Boolean).sort(), [events]);
  const filtered = useMemo(() => events.filter(e => [eventDisplayTitle(e, events), e.description || '', recipients(e)].join(' ').toLowerCase().includes(search.toLowerCase()) && (status === 'all' || e.status === status) && (audience === 'all' || e.recipientGroups?.includes(audience) || recipients(e) === audience) && (geofence === 'all' || (geofence === 'enabled') === (e.geofenceEnabled !== false))), [events, search, status, audience, geofence]);
  const groups = { active: eventSectionRoots(filtered).filter(e => e.status === 'active'), scheduled: eventSectionRoots(filtered).filter(e => e.status === 'upcoming'), archived: eventSectionRoots(filtered).filter(e => e.status === 'done') };
  const section = (label: string, kind: 'scheduled' | 'archived', open: boolean, toggle: () => void, icon: React.ReactNode, list: AppEvent[]) => <Surface className="overflow-hidden shadow-sm"><button type="button" aria-expanded={open} onClick={toggle} className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 p-5 text-left dark:border-slate-700 dark:bg-slate-900/60"><span className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2 text-brand-900 dark:bg-slate-700 dark:text-white">{icon}</span><span><h2 className="block text-sm font-black uppercase tracking-widest text-brand-900 dark:text-white">{label} ({list.length})</h2><span className="text-[10px] text-slate-400">Click to expand or collapse</span></span></span><ChevronDown className="app-disclosure-chevron"/></button><Collapsible open={open} innerClassName="p-4 sm:p-6"><div className="grid gap-4 md:grid-cols-2">{list.map(e => <EventCard key={e.id} event={e} kind={kind} onSelect={setSelected} onOpen={() => setSelected(e)}/>)}{!list.length && <p className="col-span-full text-center text-xs font-bold uppercase text-slate-400">No {kind} events found.</p>}</div></Collapsible></Surface>;
  return <Page className="max-w-7xl animate-in fade-in duration-fast"><PageHeader eyebrow={<span className="flex items-center gap-1.5"><Calendar size={14}/>Campus Calendar</span>} title="Institutional Events" description="Review active mandatory assemblies, scheduled activities, and archived events." actions={<>{hasPermission(profile?.role, 'calendar.manage_closures') && <Button variant="secondary" onClick={() => navigate('/admin/calendar')}>Holidays &amp; suspensions</Button>}<Button variant="gold" onClick={() => navigate('/ssg/events/create')}><Plus size={17}/>Create Event</Button></>}/>
    <ActivityApprovalQueue purpose="event" />
    <Surface aria-label="Event management filters" className="p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(10rem,auto))] lg:items-end"><SearchInput ariaLabel="Search events" onChange={setSearch} placeholder="Search event name..." value={search}/><CustomSelect ariaLabel="Event status" label="Status" value={status} onChange={v => setStatus(v as StatusFilter)} options={[{value:'all',label:'All Statuses'},{value:'active',label:'Ongoing'},{value:'upcoming',label:'Scheduled'},{value:'done',label:'Archived'}]}/><CustomSelect ariaLabel="Event recipients" label="Recipients" value={audience} onChange={v => setAudience(v as string)} options={[{value:'all',label:'All Recipients'},...audiences.map(v=>({value:v,label:v}))]}/><CustomSelect ariaLabel="Geofence status" label="Geofence" value={geofence} onChange={v=>setGeofence(v as GeofenceFilter)} options={[{value:'all',label:'All Events'},{value:'enabled',label:'Geofenced'},{value:'disabled',label:'Not Geofenced'}]}/></div></Surface>
    <Surface className="overflow-hidden p-4 shadow-sm sm:p-6"><div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700"><h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-brand-900 dark:text-white"><span className="h-3 w-3 rounded-full bg-emerald-500"/>Active &amp; Ongoing ({groups.active.length})</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700">Check-in Open</span></div><div className="grid gap-4 md:grid-cols-2">{groups.active.map(e=><EventCard key={e.id} event={e} kind="active" onSelect={setSelected} onOpen={()=>setSelected(e)}/>)}{!groups.active.length&&<p className="col-span-full text-center text-xs font-bold uppercase text-slate-400">No active events in session right now.</p>}</div></Surface>
    {section('Scheduled Upcoming Events','scheduled',scheduledOpen,()=>setScheduledOpen(v=>!v),<CalendarClock size={18}/>,groups.scheduled)}
    {section('Archived Events','archived',archivedOpen,()=>setArchivedOpen(v=>!v),<Archive size={18}/>,groups.archived)}
    <EventDetails event={selected} onClose={()=>setSelected(null)}/>
  </Page>;
}
