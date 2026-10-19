import ErrorNotice from '../components/ui/ErrorNotice';
import { errorMessage } from '../lib/errors';
import { useEffect, useMemo, useState } from 'react';
import CalendarExport from '../components/events/CalendarExport';
import CalendarAgenda from '../components/events/CalendarAgenda';
import CalendarActivityDetail from '../components/events/CalendarActivityDetail';
import InformationalScheduleForm from '../components/events/InformationalScheduleForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { hasPermission } from '../lib/accessControl';
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { Page, PageHeader, Surface, MetricCard } from '../components/ui/Page';
import { LinesSkeleton } from '../components/ui/PageLoading';
import Button from '../components/ui/Button';
import CustomSelect from '../components/ui/CustomSelect';
import { calendarConflicts, calendarDay, itemsOnDay, loadPersonalCalendar, monthDays, shiftMonth, type CalendarItem, type CalendarData } from '../lib/personalCalendar';
import { subscribeData } from '../lib/backend';
const categories = [{ value: 'all', label: 'All activities' }, { value: 'informational', label: 'Informational schedules' }, { value: 'attendance', label: 'Institutional events' }, { value: 'flag_ceremony', label: 'Ceremonies' }, { value: 'organization', label: 'Organizations' }, { value: 'service', label: 'Service' }, { value: 'merit', label: 'Merit' }];
export default function PersonalCalendar() {
 const today = calendarDay();
 const navigate = useNavigate();
 const { profile } = useAuth();
 const scoped = hasPermission(profile?.role, 'calendar.view_scope');
 const [detail, setDetail] = useState<CalendarItem | null>(null);
 const [scheduleForm, setScheduleForm] = useState<CalendarItem | 'new' | null>(null);
 const [month, setMonth] = useState(today.slice(0, 7)), [day, setDay] = useState(today), [category, setCategory] = useState('all');
 const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
 const hasData = loadedMonth === month;
 const [data, setData] = useState<CalendarData>({ items: [], closures: [] }), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
 useEffect(() => subscribeData(() => setRevision(value => value + 1)), []);
 useEffect(() => { let current = true; setLoading(true); setError('');
  loadPersonalCalendar(month).then(result => { if (current) { setData(result); setLoadedMonth(month); } }).catch(err => { if (current) setError(errorMessage(err)); }).finally(() => { if (current) setLoading(false); });
  return () => { current = false; };
 }, [month, revision]);
 const conflicts = useMemo(() => calendarConflicts(data.items), [data.items]);
 const filtered = data.items.filter(item => category === 'all' || item.kind === category);
 const agenda = itemsOnDay(filtered, day), closures = data.closures.filter(item => day >= item.starts_on && day <= item.ends_on);
 const dayTitle = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${day}T12:00:00+08:00`));
 const move = (next: string) => { setMonth(next); setDay(next === today.slice(0, 7) ? today : `${next}-01`); };
 return <Page><PageHeader eyebrow={scoped ? "Your academic scope" : "Your schedule"} title="My Calendar" description={scoped ? "Activities for your academic scope and your own schedule. Overlaps flag activities that may compete for time. All times are Philippine time (UTC+8)." : "Events, ceremonies, organizations, service, and merit in one place. All times are Philippine time (UTC+8)."} actions={<>{(hasPermission(profile?.role, 'calendar.manage_schedules') || hasPermission(profile?.role, 'calendar.manage_closures')) && <Button variant="secondary" fullWidth={false} className="w-full sm:w-auto" onClick={() => setScheduleForm('new')}><CalendarPlus size={16}/>Add schedule</Button>}{hasPermission(profile?.role, 'calendar.manage_closures') && <Button variant="secondary" fullWidth={false} className="w-full sm:w-auto" onClick={() => navigate('/admin/calendar')}><CalendarPlus size={16}/>Holidays &amp; Suspensions</Button>}<Button variant="secondary" fullWidth={false} className="w-full sm:w-auto" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16}/>Refresh</Button><CalendarExport month={month} items={filtered} closures={data.closures} filter={categories.find(item => item.value === category)?.label || 'All activities'} disabled={loading || !!error}/></>}/>
  <div className="grid gap-3 sm:grid-cols-3"><MetricCard icon={<CalendarDays size={20}/>} label="Sessions this month" value={!hasData ? '—' : data.items.filter(item => !item.general && item.kind !== 'informational' && !item.cancelled && !item.suspended).length}/><MetricCard icon={<AlertTriangle size={20}/>} label="Conflicting sessions" value={!hasData ? '—' : conflicts.size} detail="Overlapping times across activities"/><MetricCard label="Holidays & suspensions" value={!hasData ? '—' : data.closures.length} detail="Attendance requirements paused"/></div>
  {error && <Surface className="p-5"><ErrorNotice error={error} operation="Personal Calendar"></ErrorNotice><Button className="mt-3" variant="secondary" onClick={() => setRevision(value => value + 1)}>Retry calendar</Button></Surface>}
  <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
   <Surface className="min-w-0 p-3 sm:p-5" aria-busy={loading}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="secondary" iconOnly aria-label="Previous month" onClick={() => move(shiftMonth(month, -1))}><ChevronLeft size={18}/></Button><label className="sr-only" htmlFor="calendar-month">Calendar month</label><input id="calendar-month" type="month" value={month} onChange={event => { if (event.target.value) move(event.target.value); }} className="input-field w-40"/><Button variant="secondary" iconOnly aria-label="Next month" onClick={() => move(shiftMonth(month, 1))}><ChevronRight size={18}/></Button></div><Button fullWidth={false} variant="secondary" onClick={() => move(today.slice(0, 7))}>Today</Button></div>
    <CustomSelect label="Activity type" value={category} onChange={value => setCategory(String(value))} options={categories}/>
    <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => <span key={name} className="py-2">{name}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{monthDays(month).map((date, i) => {
     if (!date) return <span key={`blank-${i}`}/>;
     const items = !hasData ? [] : itemsOnDay(filtered, date), closed = hasData && data.closures.some(item => date >= item.starts_on && date <= item.ends_on), conflict = items.some(item => conflicts.has(item.id));
     return <button key={date} type="button" aria-label={`${date}${closed ? ', holiday or suspension' : ''}${conflict ? ', schedule conflict' : ''}, ${items.filter(item => !item.general && item.kind !== 'informational').length} sessions`} aria-pressed={date === day} onClick={() => setDay(date)} className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border text-sm transition sm:min-h-20 ${date === day ? 'border-gold-400 bg-gold-50 font-bold text-brand-900 dark:bg-gold-500/15 dark:text-gold-200' : 'border-transparent hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'} ${date === today ? 'ring-1 ring-inset ring-gold-400' : ''}`}><span>{Number(date.slice(-2))}</span><span className="flex h-2 gap-1" aria-hidden="true">{items.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 dark:bg-brand-300"/>}{closed && <span className="h-1.5 w-1.5 rounded-full bg-gold-500"/>}{conflict && <span className="h-1.5 w-1.5 rounded-full bg-red-500"/>}</span></button>;
    })}</div>
    <section aria-label="Calendar legend" className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
     <h2 className="text-sm font-semibold text-brand-900 dark:text-white">How to read the calendar</h2>
     <ul className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
      {[
       { color: 'bg-brand-500 dark:bg-brand-300', label: 'Activity scheduled', description: 'One or more activities on this date.' },
       { color: 'bg-gold-500', label: 'Holiday or suspension', description: 'Attendance is paused for affected students.' },
       { color: 'bg-red-500', label: 'Schedule conflict', description: 'Activities have overlapping times.' },
      ].map(marker => <li key={marker.label} className="flex items-start gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center"><span className={`h-2 w-2 rounded-full ${marker.color}`}/></span><div><p className="font-semibold text-brand-900 dark:text-slate-100">{marker.label}</p><p className="mt-0.5 leading-5 text-slate-500 dark:text-slate-400">{marker.description}</p></div></li>)}
      <li className="flex items-start gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-400 bg-gold-50 font-bold text-brand-900 dark:bg-gold-500/15 dark:text-gold-200">{Number(day.slice(-2))}</span><div><p className="font-semibold text-brand-900 dark:text-slate-100">Selected day</p><p className="mt-0.5 leading-5 text-slate-500 dark:text-slate-400">Its activities appear in the daily agenda.</p></div></li>
      <li className="flex items-start gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-gold-400">{Number(today.slice(-2))}</span><div><p className="font-semibold text-brand-900 dark:text-slate-100">Today</p><p className="mt-0.5 leading-5 text-slate-500 dark:text-slate-400">The current date in Philippine time.</p></div></li>
     </ul>
     <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">A date can have several dots. Select it to see the details.</p>
    </section>
    <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><Download size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400"/><div className="text-xs leading-5"><p className="font-semibold text-brand-900 dark:text-slate-100">About calendar exports</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">Both formats use the displayed month and activity filter. PDF shows the calendar and agenda, including suspended and cancelled activities with their status. ICS excludes suspended and cancelled sessions.</p><p className="mt-2 text-slate-500 dark:text-slate-400"><strong className="font-semibold text-brand-900 dark:text-slate-100">What is ICS?</strong> An iCalendar (.ics) file adds these activities to another calendar app, so you can view your school schedule alongside personal plans. It is a snapshot, not a live subscription. Export again after schedule changes; importing again may create duplicates in your calendar app.</p></div></div>
   </Surface>
   <Surface className="min-w-0 p-5"><h2 className="text-lg font-bold text-brand-900 dark:text-white">{dayTitle}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your daily agenda</p>
    {loading && !hasData ? <div className="py-8" role="status" aria-label="Loading your schedule" aria-busy="true"><LinesSkeleton count={6} /></div> : error && !hasData ? <p className="py-8">Refresh to view your schedule.</p> : <div className="mt-4 space-y-3">{closures.map(closure => <article key={closure.id} className="rounded-xl border border-gold-300 bg-gold-50 p-4 dark:border-gold-500/40 dark:bg-gold-500/10"><p className="text-xs font-bold uppercase text-gold-700 dark:text-gold-300">{closure.kind}</p><h3 className="mt-1 font-bold">{closure.title}</h3><p className="mt-1 break-words text-sm">{closure.reason}</p><p className="mt-2 text-xs">Affected attendance is suspended. No absence sanctions apply.</p></article>)}
     {agenda.length === 0 && <p className="py-6 text-sm text-slate-500 dark:text-slate-400">No activities for this day and filter.</p>}
     <CalendarAgenda items={agenda} conflicts={conflicts} onOpen={setDetail}/>
    </div>}
   </Surface>
  </div>
 {detail && <CalendarActivityDetail onEditSchedule={item => { setDetail(null); setScheduleForm(item); }} onScheduleChanged={() => { setDetail(null); setRevision(value => value + 1); }} item={detail} conflict={conflicts.has(detail.id)} onClose={() => setDetail(null)}/> }
 {scheduleForm && <InformationalScheduleForm item={scheduleForm === 'new' ? undefined : scheduleForm} onClose={() => setScheduleForm(null)} onSaved={() => { setScheduleForm(null); setRevision(value => value + 1); }}/>}</Page>;
}
