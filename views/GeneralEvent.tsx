import DetailFields from '../components/ui/DetailFields';
import { useSmartBack } from '../components/NavigationMemory';
import { formatManilaTime, formatClockTime } from '../lib/dateTime';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Plus } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { appData } from '../lib/backend';
import { canManageEventInScope } from '../lib/eventAudience';
import { canManageOrganization } from '../lib/organizations';
import { dateLabel, eventOccurrences, occurrenceProgress } from '../lib/eventTimeline';
import EventBanner from '../components/events/EventBanner';
import EventLocationDetails from '../components/events/EventLocationDetails';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Modal } from '../components/ui/Modal';
import Button from '../components/ui/Button';
import RouteLoading from '../components/ui/RouteLoading';

export default function GeneralEvent({ student = false }: { student?: boolean }) {
  const { eventId, organizationId } = useParams();
  const { profile, revision, loading } = useAuth();
  const navigate = useNavigate();
  const goBack = useSmartBack();
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<{ id: string; day: string } | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => setSelected(null), [eventId]);
  const events = useMemo(() => profile ? (organizationId ? appData.getEvents().filter(event => event.organizationId === organizationId) : student ? appData.getRecipientEvents(profile.uid) : appData.getVisibleEvents(profile.uid)) : [], [profile, revision, student, organizationId]);
  const parent = events.find(event => event.id === eventId && event.isGeneralEvent && (!organizationId || event.organizationId === organizationId));
  const rows = useMemo(() => eventOccurrences(events.filter(event => event.parentEventId === parent?.id && !event.isGeneralEvent)), [events, parent?.id]);
  const days = [...new Set(rows.map(row => row.day))];
  const selectedRow = rows.find(row => row.event.id === selected?.id && row.day === selected.day);
  const organization = parent?.organizationId ? appData.getOrganizations().find(item => item.id === parent.organizationId) : undefined;
  const canManage = !student && Boolean(parent && (organization ? canManageOrganization(profile, organization) : canManageEventInScope(profile, parent, appData.getSchoolStructure())));
  const base = parent?.organizationId ? `/organizations/${parent.organizationId}/events` : '/ssg/events';
  const back = student ? '/student/events' : organizationId ? `/organizations/${organizationId}` : '/ssg/events';
  if (loading) return <RouteLoading embedded label="Loading event" />;
  if (!parent) return <Page><Button variant="secondary" onClick={() => goBack(back)}>Back to events</Button><p>This general event is unavailable.</p></Page>;
  return <Page className="max-w-6xl">
    <section aria-label="Event header" className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      {parent.bannerUrl && <EventBanner src={parent.bannerUrl} alt={`${parent.title} banner`} background />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/90 via-white/50 to-transparent dark:from-slate-950/95 dark:via-slate-950/50 dark:to-slate-950/10" />
      <div className="relative flex min-h-64 flex-col justify-between gap-10 p-5 sm:min-h-72 sm:p-8">
        <nav aria-label="Event navigation">
          <Button variant="secondary" size="sm" fullWidth={false} onClick={() => goBack(back)}><ArrowLeft size={16} /> Back to events</Button>
        </nav>
        <PageHeader className="gap-6" eyebrow="General event" title={<span className="break-words">{parent.title}</span>} description={`${parent.startDate} to ${parent.endDate} - Philippine time`} actions={canManage && parent.status !== 'done' ? <div className="flex flex-wrap gap-2"><Button variant="secondary" fullWidth={false} onClick={() => navigate(`${base}/${parent.id}/edit`)}>Edit general event</Button>{!parent.cancellationStatus && <Button fullWidth={false} onClick={() => navigate(`${base}/create?parent=${parent.id}`)}><Plus size={16} /> Add specific event</Button>}</div> : undefined} />
      </div>
    </section>
    {parent.description && <Surface className="whitespace-pre-wrap p-5 text-sm">{parent.description}</Surface>}
    <p className="text-sm text-slate-500">Activities are grouped by date. Progress shows elapsed scheduled time, not attendance completion.</p>
    {days.map(day => <Surface key={day} className="space-y-4 p-4 sm:p-6" aria-label={dateLabel(day)}>
      <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={20} />{dateLabel(day)}</h2>
      <div className="grid gap-4 md:grid-cols-2">{rows.filter(row => row.day === day).map(row => {
        const progress = occurrenceProgress(row, now);
        return <button key={row.event.id} type="button" onClick={() => setSelected({ id: row.event.id, day })} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-gold-500 dark:border-slate-700">
          <h3 className="text-base font-bold">{row.event.title}</h3>
          <p className="text-sm">{formatManilaTime(row.start, { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} - {formatManilaTime(row.end, { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</p>
          <p className="flex items-center gap-2 text-sm"><MapPin size={16} />{row.event.venue || 'View location details'}</p>
          <p className="text-sm font-semibold">{progress.label}</p>
          <div role="progressbar" aria-label={`${row.event.title} schedule progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-gold-500" style={{ width: `${progress.percent}%` }} /></div>
          <span className="block text-xs underline">View activity details</span>
        </button>;
      })}</div>
    </Surface>)}
    {!days.length && <Surface className="p-6 text-sm">No specific activities are available yet.</Surface>}
    {selectedRow && <Modal open onClose={() => setSelected(null)} title={selectedRow.event.title} description={dateLabel(selectedRow.day)} size="lg" footer={canManage && selectedRow.event.status !== 'done' ? <Button onClick={() => navigate(`${base}/${selectedRow.event.id}/edit`)}>Edit activity</Button> : undefined}>
      <div className="space-y-6 text-sm">
        {selectedRow.event.bannerUrl && <EventBanner src={selectedRow.event.bannerUrl} alt={`${selectedRow.event.title} banner`} />}
        <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-900 dark:bg-brand-900/40 dark:text-brand-200">{occurrenceProgress(selectedRow, now).label}</span>
        <section className="space-y-2"><h3 className="font-bold text-brand-900 dark:text-white">Activity overview</h3><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 leading-6 dark:bg-slate-900/60">{selectedRow.event.description || 'No additional instructions.'}</p></section>
        <section className="space-y-3"><h3 className="font-bold text-brand-900 dark:text-white">Attendance windows · Philippine time</h3><p className="text-xs text-slate-500">{dateLabel(selectedRow.day)} · UTC+8</p>
          {selectedRow.event.attendanceWindows?.length ? <div className="space-y-3">{[...selectedRow.event.attendanceWindows].sort((a, b) => a.timeIn.localeCompare(b.timeIn)).map((window, index) => <div key={window.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h4 className="font-semibold">{window.label || `Window ${index + 1}`}</h4><DetailFields fields={[
            { label: 'Opens', value: formatClockTime(window.timeIn) }, { label: 'Closes', value: formatClockTime(window.timeOut) },
            { label: 'Late after', value: `${window.lateAfterMinutes} minutes` },
          ]} /></div>)}</div> : <DetailFields fields={[{ label: 'Starts', value: formatManilaTime(selectedRow.start) }, { label: 'Ends', value: formatManilaTime(selectedRow.end) }]} />}
          <DetailFields fields={[{ label: 'Recipients', value: selectedRow.event.recipientGroups?.join(', ') || selectedRow.event.targetValue || 'Assigned attendees' }]} />
        </section>
        <EventLocationDetails event={selectedRow.event} />
        <section className="space-y-3"><h3 className="font-bold text-brand-900 dark:text-white">Attendance rules</h3><DetailFields fields={[
          { label: 'Late', value: `${selectedRow.event.sanctionRules?.late.value || 0} ${selectedRow.event.sanctionRules?.late.unit || 'minutes'}` },
          { label: 'Absent', value: `${selectedRow.event.sanctionRules?.absent.value ?? selectedRow.event.penaltyValue} ${selectedRow.event.sanctionRules?.absent.unit || selectedRow.event.penaltyUnit}` },
        ]} /></section>
      </div>
    </Modal>}
  </Page>;
}
