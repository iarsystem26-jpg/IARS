import { AppEvent } from '../types';

const DAY = 86400000;
export const manilaDate = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
export const dateLabel = (day: string) => new Date(`${day}T12:00:00+08:00`).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export interface EventOccurrence { event: AppEvent; day: string; start: number; end: number }

export function eventOccurrences(events: AppEvent[]): EventOccurrence[] {
  return events.flatMap(event => {
    const first = manilaDate(event.startTime), last = manilaDate(event.endTime);
    const rows: EventOccurrence[] = [];
    const windows = event.attendanceWindows || [];
    const timeIn = windows.map(window => window.timeIn).sort()[0];
    const timeOut = windows.map(window => window.timeOut).sort().at(-1);
    for (let stamp = Date.parse(`${first}T00:00:00+08:00`), count = 0; count < 367; stamp += DAY, count++) {
      const day = manilaDate(stamp);
      if (day > last) break;
      const start = Math.max(event.startTime, timeIn ? Date.parse(`${day}T${timeIn}:00+08:00`) : stamp);
      const end = Math.min(event.endTime, timeOut ? Date.parse(`${day}T${timeOut}:00+08:00`) : stamp + DAY);
      if (end > start) rows.push({ event, day, start, end });
    }
    return rows;
  }).sort((a, b) => a.start - b.start || a.event.title.localeCompare(b.event.title));
}

function remaining(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function occurrenceProgress(row: EventOccurrence, now: number) {
  const { event, start, end } = row;
  if (event.cancellationStatus) return { label: 'Cancelled', percent: 0 };
  if (event.approvalStatus === 'pending' || event.status === 'pending') return { label: 'Pending approval', percent: 0 };
  if (event.approvalStatus === 'rejected' || event.status === 'rejected') return { label: 'Not approved', percent: 0 };
  if (now >= end || event.status === 'done') return { label: 'Already happened', percent: 100 };
  if (now < start) return { label: `Starts in ${remaining(start - now)}`, percent: 0 };
  const percent = Math.min(100, Math.max(0, Math.floor((now - start) / (end - start) * 100)));
  const windows = event.attendanceWindows || [];
  const sessions = windows.map(w => ({ start: Date.parse(`${row.day}T${w.timeIn}:00+08:00`), end: Date.parse(`${row.day}T${w.timeOut}:00+08:00`) }));
  const next = sessions.filter(w => w.start > now).sort((a, b) => a.start - b.start)[0];
  if (next && !sessions.some(w => now >= w.start && now < w.end)) return { label: `Break · Next window in ${remaining(next.start - now)}`, percent };
  return { label: `Happening now · Ends in ${remaining(end - now)}`, percent };
}
