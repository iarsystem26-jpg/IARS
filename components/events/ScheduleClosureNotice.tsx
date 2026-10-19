import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { loadScheduleNotices, type CalendarClosure } from '../../lib/personalCalendar';
import { formatManilaDate } from '../../lib/dateTime';

export default function ScheduleClosureNotice({ first, last }: { first: string; last: string }) {
 const [notices, setNotices] = useState<CalendarClosure[]>([]), [error, setError] = useState(false);
 useEffect(() => {
  let current = true; setNotices([]); setError(false);
  if (first && last && last >= first) loadScheduleNotices(first, last).then(rows => { if (current) setNotices(rows); }).catch(() => { if (current) setError(true); });
  return () => { current = false; };
 }, [first, last]);
 if (error) return <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Holiday notices could not be loaded. Refresh before scheduling. Saved suspensions still apply to attendance.</p>;
 if (!notices.length) return null;
 return <aside className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm dark:border-gold-500/40 dark:bg-gold-500/10" aria-label="Schedule holiday notices"><h3 className="flex items-center gap-2 font-bold text-gold-800 dark:text-gold-200"><CalendarDays size={18}/>Holidays or suspensions overlap these dates</h3><p className="mt-2 leading-6">Attendance and absence sanctions remain paused for affected dates and academic units. Check the notice scope before scheduling.</p><ul className="mt-2 space-y-2">{notices.map(item => <li key={item.id}><b>{item.title}</b> · {formatManilaDate(`${item.starts_on}T12:00:00+08:00`)} – {formatManilaDate(`${item.ends_on}T12:00:00+08:00`)}<span className="block break-words text-xs">{item.reason}</span></li>)}</ul></aside>;
}
