import { parseManilaDateTime, startOfManilaPeriod } from './dateTime';

export type AnalyticsStatus = 'present' | 'late' | 'excused' | 'absent' | 'not_recorded';
export interface AnalyticsRecord {
  id: string;
  studentUid: string;
  studentName: string;
  eventId: string;
  eventName: string;
  attendanceDate: number;
  completed: boolean;
  status: AnalyticsStatus;
  section: string;
  program?: string;
  level: string;
}
export type AnalyticsPeriod = 'all' | 'this_month' | 'this_week' | 'custom';
export type AnalyticsCoverage = 'live' | 'completed';
export type AnalyticsGrouping = 'eventName' | 'program' | 'section' | 'level';
export const MANILA_DAY = 86400000;
export const manilaDay = (time: number) => Math.floor((time + 8 * 3600000) / MANILA_DAY) * MANILA_DAY - 8 * 3600000;

export function attendanceBounds(period: AnalyticsPeriod, range: { start: string; end: string }, now: number) {
  const start = period === 'this_week' ? startOfManilaPeriod('week', now)
    : period === 'this_month' ? startOfManilaPeriod('month', now)
      : period === 'custom' && range.start ? parseManilaDateTime(range.start) : -Infinity;
  const end = period === 'custom' && range.end ? parseManilaDateTime(range.end) + MANILA_DAY : Infinity;
  return { start, end };
}

export function summarizeAttendance(records: AnalyticsRecord[]) {
  const counts = { present: 0, late: 0, excused: 0, absent: 0, not_recorded: 0 };
  records.forEach(record => counts[record.status]++);
  const resolved = records.length - counts.not_recorded;
  const attended = counts.present + counts.late;
  return {
    ...counts, total: records.length, resolved, attended,
    students: new Set(records.map(record => record.studentUid)).size,
    events: new Set(records.map(record => record.eventId)).size,
    // Excused entries are resolved but do not imply physical attendance.
    attendanceRate: resolved ? (attended + counts.excused) / resolved * 100 : null,
    participationRate: resolved ? attended / resolved * 100 : null,
    punctualityRate: attended ? counts.present / attended * 100 : null,
    coverageRate: records.length ? resolved / records.length * 100 : null,
  };
}

export function analyzeAttendance(records: AnalyticsRecord[], period: AnalyticsPeriod, range: { start: string; end: string }, now: number, coverage: AnalyticsCoverage = 'live') {
  const bounds = attendanceBounds(period, range, now);
  // Include due roster entries for live events with actual attendance so
  // completeness reflects students whose statuses are still unrecorded.
  const liveEventIds = new Set(records.filter(record => !record.completed && record.status !== 'not_recorded'
    && Number.isFinite(record.attendanceDate) && record.attendanceDate <= now).map(record => record.eventId));
  const eligible = records.filter(record => (record.completed || coverage === 'live' && liveEventIds.has(record.eventId))
    && Number.isFinite(record.attendanceDate) && record.attendanceDate <= now);
  const current = eligible.filter(record => record.attendanceDate >= bounds.start && record.attendanceDate < bounds.end);
  const summary = summarizeAttendance(current);
  let start = bounds.start;
  let end = Math.min(bounds.end, manilaDay(now) + MANILA_DAY);
  let comparisonCurrent = current;
  // All-time/open-start selections compare equal calendar spans in the observed history.
  if (!Number.isFinite(start)) {
    if (current.length) {
      const first = current.reduce((value, record) => Math.min(value, manilaDay(record.attendanceDate)), Infinity);
      end = current.reduce((value, record) => Math.max(value, manilaDay(record.attendanceDate)), -Infinity) + MANILA_DAY;
      const span = Math.floor((end - first) / MANILA_DAY / 2) * MANILA_DAY;
      start = span ? end - span : end;
    } else start = end;
    comparisonCurrent = current.filter(record => record.attendanceDate >= start && record.attendanceDate < end);
  }
  const span = Math.max(0, end - start);
  const previousStart = start - span;
  const previous = span ? eligible.filter(record => record.attendanceDate >= previousStart && record.attendanceDate < start) : [];
  const comparison = {
    current: summarizeAttendance(comparisonCurrent), previous: summarizeAttendance(previous),
    start, end, previousStart,
    available: span > 0 && comparisonCurrent.some(record => record.status !== 'not_recorded') && previous.some(record => record.status !== 'not_recorded'),
  };
  const students = new Map<string, AnalyticsRecord[]>();
  current.filter(record => record.completed).forEach(record => {
    const rows = students.get(record.studentUid) || [];
    rows.push(record);
    students.set(record.studentUid, rows);
  });
  const followUps = [...students.entries()].map(([uid, rows]) => ({ uid, name: rows[0].studentName, ...summarizeAttendance(rows) }))
    .filter(student => student.absent >= 2)
    .sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name));
  const provisional = current.filter(record => !record.completed);
  const provisionalEvents = new Set(provisional.map(record => record.eventId)).size;
  const completedMissing = current.filter(record => record.completed && record.status === 'not_recorded').length;
  return { current, summary, comparison, followUps, provisionalEvents, provisionalEntries: provisional.length, completedMissing };
}

export function attendanceGroups(records: AnalyticsRecord[], grouping: AnalyticsGrouping) {
  const groups = new Map<string, { name: string; records: AnalyticsRecord[] }>();
  records.forEach(record => {
    const name = record[grouping]?.trim() || 'Unassigned';
    // Section labels are not globally unique across programs and year levels.
    const label = grouping === 'section' ? [record.program, record.level, name].filter(Boolean).join(' / ') : name;
    const key = grouping === 'eventName' ? record.eventId : label;
    const group = groups.get(key) || { name: label, records: [] };
    group.records.push(record);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([id, group]) => ({ id, name: group.name, ...summarizeAttendance(group.records) }))
    .sort((a, b) => (b.participationRate ?? -1) - (a.participationRate ?? -1) || b.resolved - a.resolved || a.name.localeCompare(b.name));
}

export function attendanceTrend(records: AnalyticsRecord[], interval: 'day' | 'week' | 'month') {
  const buckets = new Map<number, AnalyticsRecord[]>();
  records.forEach(record => {
    const time = interval === 'day' ? manilaDay(record.attendanceDate) : startOfManilaPeriod(interval, record.attendanceDate);
    const rows = buckets.get(time) || [];
    rows.push(record);
    buckets.set(time, rows);
  });
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([time, rows]) => ({ time, ...summarizeAttendance(rows) }));
}
