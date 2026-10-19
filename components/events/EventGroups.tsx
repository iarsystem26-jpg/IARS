import { formatClockTime } from '../../lib/dateTime';
import EventBanner from './EventBanner';
import React from 'react';
import { AppEvent } from '../../types';
import { Surface } from '../ui/Page';
import Button from '../ui/Button';

export function EventGroups({ events, onOpen, onAdd, groupIds }: { groupIds?: string[]; events: AppEvent[]; onOpen: (event: AppEvent) => void; onAdd?: (event: AppEvent) => void }) {
  const ids = groupIds || [...new Set(events.flatMap(event => event.isGeneralEvent ? [event.id] : event.parentEventId ? [event.parentEventId] : []))];
  if (!ids.length) return null;
  return <Surface className="space-y-4 p-4 sm:p-6" aria-label="General events">
    {!groupIds && <h2 className="text-lg font-bold">General events</h2>}
    {!groupIds && <p className="text-sm text-slate-500">Attendance is taken separately for each specific event. All schedules use Philippine time.</p>}
    {ids.map(id => {
      const parent = events.find(event => event.id === id);
      const children = events.filter(event => event.parentEventId === id).sort((a, b) => a.startTime - b.startTime);
      return <section key={id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        {parent?.bannerUrl && <button type="button" className="block w-full text-left" aria-label={`Open ${parent.title}`} onClick={() => onOpen(parent)}><EventBanner src={parent.bannerUrl} alt={`${parent.title} banner`} /></button>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-bold">{parent ? <button type="button" className="text-left underline" onClick={() => onOpen(parent)}>{parent.title}</button> : children[0]?.parentEventTitle || 'General event'}</h3>
            {parent && <p className="text-sm text-slate-500">{parent.startDate} to {parent.endDate} · {parent.status}</p>}</div>
          {parent && onAdd && parent.status !== 'done' && !parent.cancellationStatus && <Button variant="secondary" onClick={() => onAdd(parent)}>Add specific event</Button>}
        </div>
        <ul className="mt-3 space-y-2">{children.map(event => <li key={event.id}>
          <button type="button" onClick={() => onOpen(event)} className="w-full rounded-lg bg-slate-50 p-3 text-left hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700">
            <span className="block font-semibold">{event.title}</span>
            <span className="block text-sm">{event.startDate} to {event.endDate} · {event.venue || (event.geofenceEnabled ? 'Geofenced location' : 'No location specified')} · {event.status}</span>
            {event.attendanceWindows?.map((window, index) => <span key={window.id} className="block text-xs text-slate-500">{window.label || `Window ${index + 1}`}: {formatClockTime(window.timeIn)}–{formatClockTime(window.timeOut)}</span>)}
          </button>
        </li>)}</ul>
        {!children.length && <p className="mt-3 text-sm text-slate-500">No specific events available yet.</p>}
      </section>;
    })}
  </Surface>;
}
