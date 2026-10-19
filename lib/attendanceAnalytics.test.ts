import { describe, expect, it } from 'vitest';
import { analyzeAttendance, attendanceBounds, attendanceGroups, attendanceTrend, AnalyticsRecord, summarizeAttendance } from './attendanceAnalytics';

const time = (date: string) => Date.parse(`${date}T08:00:00+08:00`);
const row = (status: AnalyticsRecord['status'], date = '2026-10-09', extra: Partial<AnalyticsRecord> = {}): AnalyticsRecord => ({
  id: `${status}-${date}`, studentUid: 's1', studentName: 'Student One', eventId: 'e1', eventName: 'Assembly',
  attendanceDate: time(date), completed: true, status, section: 'A', level: 'Grade 11', program: 'STEM', ...extra,
});

describe('attendance analytics', () => {
  it('separates participation, excused credit, punctuality and missing coverage', () => {
    const result = summarizeAttendance(['present', 'late', 'excused', 'absent', 'not_recorded'].map(status => row(status as AnalyticsRecord['status'])));
    expect(result).toMatchObject({ total: 5, resolved: 4, participationRate: 50, attendanceRate: 75, punctualityRate: 50, coverageRate: 80, students: 1 });
    expect(summarizeAttendance([]).participationRate).toBeNull();
    expect(summarizeAttendance([row('not_recorded')]).attendanceRate).toBeNull();
    expect(summarizeAttendance([row('absent')]).punctualityRate).toBeNull();
  });

  it('compares Monday-to-Friday with the preceding five Manila calendar days', () => {
    const now = time('2026-10-09');
    const result = analyzeAttendance([
      row('present', '2026-10-05'), row('late', '2026-10-09'), row('absent', '2026-10-01'),
      row('present', '2026-09-30'), row('present', '2026-10-10'), row('absent', '2026-10-08', { completed: false }),
    ], 'this_week', { start: '', end: '' }, now, 'completed');
    expect(result.summary.total).toBe(2);
    expect(result.comparison.available).toBe(true);
    expect(result.comparison.current.participationRate).toBe(100);
    expect(result.comparison.previous.participationRate).toBe(50);
    expect(result.comparison.start).toBe(Date.parse('2026-10-05T00:00:00+08:00'));
    expect(result.comparison.previousStart).toBe(Date.parse('2026-09-30T00:00:00+08:00'));
  });

  it('includes the custom end date and uses an exclusive next-day boundary', () => {
    const bounds = attendanceBounds('custom', { start: '2026-10-01', end: '2026-10-02' }, time('2026-10-09'));
    expect(bounds.end).toBe(Date.parse('2026-10-03T00:00:00+08:00'));
    const result = analyzeAttendance([row('present', '2026-10-01'), row('present', '2026-10-02'), row('absent', '2026-10-03'), row('absent', '2026-09-29')], 'custom', { start: '2026-10-01', end: '2026-10-02' }, time('2026-10-09'));
    expect(result.current).toHaveLength(2);
    expect(result.comparison.previous.absent).toBe(1);
  });

  it('does not manufacture comparisons from a single day or unresolved history', () => {
    expect(analyzeAttendance([row('present')], 'all', { start: '', end: '' }, time('2026-10-09')).comparison.available).toBe(false);
    const result = analyzeAttendance([row('not_recorded', '2026-10-01'), row('present', '2026-10-09')], 'all', { start: '', end: '' }, time('2026-10-09'));
    expect(result.comparison.available).toBe(false);
  });

  it('compares equal halves for all time while keeping the full-history headline', () => {
    const result = analyzeAttendance([row('absent', '2026-10-01'), row('present', '2026-10-04')], 'all', { start: '', end: '' }, time('2026-10-09'));
    expect(result.summary.participationRate).toBe(50);
    expect(result.comparison.current.participationRate).toBe(100);
    expect(result.comparison.previous.participationRate).toBe(0);
    expect(result.comparison.available).toBe(true);
  });

  it('buckets by Manila dates, orders chronologically, and avoids false zero days', () => {
    const records = [row('late', '2026-10-09'), row('present', '2026-10-01', { attendanceDate: Date.parse('2026-09-30T17:00:00Z') })];
    const daily = attendanceTrend(records, 'day');
    expect(daily.map(point => point.time)).toEqual([Date.parse('2026-10-01T00:00:00+08:00'), Date.parse('2026-10-09T00:00:00+08:00')]);
    expect(attendanceTrend(records, 'month')).toHaveLength(1);
    expect(attendanceTrend(records, 'week')).toHaveLength(2);
  });

  it('distinguishes events with the same title and sections in different programs', () => {
    const records = [row('present'), row('absent', '2026-10-09', { eventId: 'e2', program: 'ABM', studentUid: 's2' })];
    expect(attendanceGroups(records, 'eventName')).toHaveLength(2);
    expect(attendanceGroups(records, 'section')).toHaveLength(2);
    expect(attendanceGroups(records, 'level')).toHaveLength(1);
  });

  it('flags repeated absent entries only within the selected completed scope', () => {
    const result = analyzeAttendance([row('absent', '2026-10-05'), row('absent', '2026-10-09'), row('absent', '2026-09-01', { studentUid: 's2' }), row('absent', '2026-10-08', { studentUid: 's2', completed: false })], 'this_week', { start: '', end: '' }, time('2026-10-09'));
    expect(result.followUps).toHaveLength(1);
    expect(result.followUps[0]).toMatchObject({ uid: 's1', absent: 2, events: 1 });
  });

  it('shows live attendance by default and includes due unrecorded recipients in completeness', () => {
    const records = [
      row('present', '2026-10-09', { completed: false }),
      row('late', '2026-10-09', { completed: false, studentUid: 's2' }),
      row('not_recorded', '2026-10-09', { completed: false, studentUid: 's3' }),
      row('not_recorded', '2026-10-09', { completed: false, eventId: 'not-started' }),
      row('present', '2026-10-10', { completed: false, eventId: 'future' }),
    ];
    const result = analyzeAttendance(records, 'all', { start: '', end: '' }, time('2026-10-09'));
    expect(result.summary).toMatchObject({ total: 3, events: 1, students: 3, participationRate: 100, punctualityRate: 50, not_recorded: 1 });
    expect(result.summary.coverageRate).toBeCloseTo(200 / 3);
    expect(result.provisionalEvents).toBe(1);
    expect(result.completedMissing).toBe(0);
    expect(analyzeAttendance(records, 'all', { start: '', end: '' }, time('2026-10-09'), 'completed').summary.total).toBe(0);
  });

  it('includes recorded live absences in rates but reserves follow-up flags for completed events', () => {
    const records = [row('absent', '2026-10-05', { completed: false }), row('absent', '2026-10-09', { completed: false })];
    const result = analyzeAttendance(records, 'all', { start: '', end: '' }, time('2026-10-09'));
    expect(result.summary.absent).toBe(2);
    expect(result.followUps).toHaveLength(0);
    expect(result.provisionalEntries).toBe(2);
  });
});
