import { Layers } from 'lucide-react';
import { calendarAgendaGroups, type CalendarItem } from '../../lib/personalCalendar';
import { formatManilaDateTime } from '../../lib/dateTime';
import Button from '../ui/Button';

export default function CalendarAgenda({ items, conflicts, onOpen }: { items: CalendarItem[]; conflicts: Set<string>; onOpen: (item: CalendarItem) => void }) {
 const activityCard = (item: CalendarItem, nested = false) => <article key={item.id} className={`min-w-0 rounded-xl border p-4 ${nested ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40' : 'border-slate-200 dark:border-slate-700'}`}>
  <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded bg-brand-50 px-2 py-1 capitalize text-brand-800 dark:bg-brand-900 dark:text-brand-200">{item.kind === 'informational' ? 'Informational schedule' : item.kind.replace('_', ' ')}</span>{nested && <span className="px-2 py-1 text-slate-500 dark:text-slate-400">Specific activity</span>}{item.cancelled ? <span className="px-2 py-1">Cancelled</span> : item.suspended ? <span className="px-2 py-1 text-gold-700 dark:text-gold-300">Suspended · no attendance required</span> : conflicts.has(item.id) && <span className="px-2 py-1 text-red-700 dark:text-red-300">Schedule conflict</span>}</div>
  <h3 className="mt-2 break-words font-bold">{item.title}</h3><p className="mt-1 text-sm">{item.label === 'Default session' ? '' : `${item.label} · `}{formatManilaDateTime(item.starts_at)} – {formatManilaDateTime(item.ends_at)}</p>{item.venue && <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{item.venue}</p>}<Button variant="secondary" size="sm" className="mt-3" onClick={() => onOpen(item)}>{item.kind === 'informational' ? 'View schedule' : 'View activity'}</Button>
 </article>;
 return <div className="space-y-3">{calendarAgendaGroups(items).map(group => group.parent || group.title ? <section key={group.id} aria-label={`General event: ${group.title}`} className="min-w-0 rounded-2xl border border-gold-300 bg-gold-50/40 p-4 dark:border-gold-500/40 dark:bg-gold-500/5">
  <div className="flex items-start gap-2"><Layers size={18} className="mt-0.5 shrink-0 text-gold-600 dark:text-gold-300"/><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-gold-700 dark:text-gold-300">General event</p><h3 className="mt-1 break-words font-bold text-brand-900 dark:text-white">{group.title}</h3></div></div>
  {group.parent && <p className="mt-2 text-sm">{formatManilaDateTime(group.parent.starts_at)} – {formatManilaDateTime(group.parent.ends_at)}</p>}
  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Groups specific activities. Attendance is recorded on each specific activity.</p>
  {group.parent && <Button variant="secondary" size="sm" className="mt-3" onClick={() => onOpen(group.parent!)}>View general event</Button>}
  {group.items.length ? <div className="mt-4 space-y-3 border-l-2 border-gold-300 pl-3 dark:border-gold-500/40">{group.items.map(item => activityCard(item, true))}</div> : <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No specific activities for this day and filter.</p>}
 </section> : activityCard(group.items[0]))}</div>;
}
