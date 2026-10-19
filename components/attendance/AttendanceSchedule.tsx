import React from 'react';
import { Clock3 } from 'lucide-react';
import type { AppEvent } from '../../types';
import { formatManilaDate, formatManilaTime } from '../../lib/dateTime';
import { manilaDate } from '../../lib/eventTimeline';

export default function AttendanceSchedule({ event, now }: { event: AppEvent; now: number }) {
  const firstDay = manilaDate(event.startTime);
  const lastDay = manilaDate(event.endTime);
  const day = [firstDay, manilaDate(now), lastDay].sort()[1];
  const windows = event.attendanceWindows?.length ? event.attendanceWindows.map(window => ({
    id: window.id, label: window.label || 'Attendance window',
    start: Math.max(event.startTime, Date.parse(`${day}T${window.timeIn}:00+08:00`)),
    end: Math.min(event.endTime, Date.parse(`${day}T${window.timeOut}:00+08:00`)),
  })).filter(window => window.end > window.start).sort((a, b) => a.start - b.start) : [
    { id: 'event', label: 'Event attendance', start: event.startTime, end: event.endTime },
  ];
  const inactive = event.status === 'done' || Boolean(event.cancellationStatus);
  const active = !inactive && windows.find(window => now >= window.start && now < window.end);
  const tomorrow = manilaDate(Date.parse(`${day}T12:00:00+08:00`) + 86400000);
  const tomorrowWindows = tomorrow <= lastDay ? (event.attendanceWindows || []).map(window => ({
    start: Math.max(event.startTime, Date.parse(`${tomorrow}T${window.timeIn}:00+08:00`)),
    end: Math.min(event.endTime, Date.parse(`${tomorrow}T${window.timeOut}:00+08:00`)),
  })).filter(window => window.end > window.start).sort((a, b) => a.start - b.start) : [];
  const next = !inactive && (windows.find(window => window.start > now) || tomorrowWindows.find(window => window.start > now));
  const label = event.cancellationStatus ? 'Cancelled' : active ? 'Window open' : next ? 'Opens soon' : 'Windows closed';
  const time = (stamp: number) => formatManilaTime(stamp, { second: undefined });
  const date = (stamp: number) => formatManilaDate(stamp, { month: 'short', day: 'numeric', year: undefined });
  return <section aria-label="Attendance windows" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
      <h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-white"><Clock3 size={17} className="text-gold-600" /> Attendance windows</h3>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>{label}</span>
    </div>
    <div className="space-y-3 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">{event.attendanceWindows?.length ? `${date(Date.parse(`${day}T12:00:00+08:00`))} · ` : ''}Philippine time (UTC+8){firstDay !== lastDay && event.attendanceWindows?.length ? ' · Repeats daily during the event' : ''}</p>
      {windows.map(window => <div key={window.id} className={`rounded-xl p-3 ${active && active.id === window.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : 'bg-slate-50 dark:bg-slate-900/60'}`}>
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-bold text-brand-900 dark:text-white">{window.label}</p><span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{inactive || now >= window.end ? 'Closed' : now >= window.start ? 'Open now' : 'Upcoming'}</span></div>
        <dl className="grid grid-cols-2 gap-3"><div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Opens</dt><dd className="mt-1 text-sm font-bold text-brand-900 dark:text-white">{time(window.start)}{!event.attendanceWindows?.length && firstDay !== lastDay && <span className="block text-xs font-normal text-slate-500">{date(window.start)}</span>}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Closes</dt><dd className="mt-1 text-sm font-bold text-brand-900 dark:text-white">{time(window.end)}{!event.attendanceWindows?.length && firstDay !== lastDay && <span className="block text-xs font-normal text-slate-500">{date(window.end)}</span>}</dd></div></dl>
      </div>)}
      <p role="status" className="text-xs leading-5 text-slate-600 dark:text-slate-300">{event.cancellationStatus ? 'This event has been cancelled.' : active ? `Current window closes ${manilaDate(active.end) === manilaDate(now) ? '' : `on ${date(active.end)} `}at ${time(active.end)}.` : next ? `Next window opens ${manilaDate(next.start) === manilaDate(now) ? 'today' : `on ${date(next.start)}`} at ${time(next.start)}.` : 'Attendance windows for this event have ended.'}</p>
    </div>
  </section>;
}
