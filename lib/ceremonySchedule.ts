import { EventAttendanceWindow } from '../types';

export const manilaDate = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const dateStamp = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const validDate = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dateStamp(day)) && new Date(dateStamp(day)).toISOString().slice(0, 10) === day;
export function defaultCeremonyRange(now = Date.now()) {
  // Near month-end, open the upcoming month for planning.
  return ceremonyMonthRange(manilaDate(now + 7 * 86400000).slice(0, 7));
}
export function ceremonyMonthRange(month: string) {
  const start = `${month}-01`;
  if (!validDate(start)) return { start: '', end: '' };
  const first = new Date(dateStamp(start));
  return { start, end: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) };
}
export function canScheduleCeremony(day: string, now = Date.now()) {
  const today = manilaDate(now);
  return validDate(day) && day >= today && (day.slice(0, 7) === today.slice(0, 7) || dateStamp(day) <= dateStamp(today) + 7 * 86400000);
}
export function predictCeremonyDates(start: string, end: string, weekdays: number[], perMonth: number): string[] {
  if (!validDate(start) || !validDate(end) || end < start || dateStamp(end) - dateStamp(start) > 366 * 86400000 || !Number.isInteger(perMonth) || perMonth < 1 || perMonth > 31) return [];
  const counts: Record<string, number> = {};
  const dates: string[] = [];
  for (let stamp = dateStamp(start); stamp <= dateStamp(end); stamp += 86400000) {
    const date = new Date(stamp);
    const day = date.toISOString().slice(0, 10), month = day.slice(0, 7);
    if (weekdays.includes(date.getUTCDay()) && (counts[month] || 0) < perMonth) {
      dates.push(day); counts[month] = (counts[month] || 0) + 1;
    }
  }
  return dates;
}
export function validWindows(windows: EventAttendanceWindow[]) {
  const sorted = [...windows].sort((a, b) => a.timeIn.localeCompare(b.timeIn));
  return sorted.length > 0 && new Set(sorted.map(w => w.id)).size === sorted.length && sorted.every((w, i) =>
    Boolean(w.id) && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.timeIn) && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.timeOut)
    && w.timeOut > w.timeIn && Number.isInteger(w.lateAfterMinutes) && w.lateAfterMinutes >= 0
    && (i === 0 || w.timeIn >= sorted[i - 1].timeOut));
}
