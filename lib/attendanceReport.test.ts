import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAttendanceReport, type AttendanceReportOptions } from './attendanceReport';
import { studentBelongsToReportUnit } from './attendanceReportScope';
import type { SchoolNode, UserProfile } from '../types';

const nodes: SchoolNode[] = [{ id: 'campus', name: 'Campus', type: 'campus', children: [
  { id: 'shs', name: 'Senior High School', type: 'education_unit', children: [{ id: 'a', name: 'A', type: 'section' }] },
  { id: 'college', name: 'College', type: 'education_unit', children: [{ id: 'b', name: 'A', type: 'block' }] },
  { id: 'old', name: 'Old unit', type: 'education_unit', metadata: { archived: true } },
] }];
const student = (data: Record<string, unknown>) => ({ school_data: data }) as UserProfile;
const options: AttendanceReportOptions = {
  schoolLogo: new Uint8Array(readFileSync('public/academic-seal-transparent.png')),
  schoolName: 'Senior High School', scope: 'Period: All time | All events',
  includeCharts: true, includeTables: true, groupBy: 'status',
  records: ['present', 'late', 'excused', 'absent', 'not_recorded'].map((status, index) => ({
    studentUid: 'student-1', studentName: 'Juan Dela Cruz', studentId: 'S-001',
    eventTitle: `Activity ${index + 1}`, status: status as AttendanceReportOptions['records'][number]['status'],
    section: 'A', level: 'Grade 11', recordedAt: Date.parse('2026-10-09T00:00:00Z'),
  })),
};
const pages = (doc: ReturnType<typeof createAttendanceReport>) => (doc.internal.pages as unknown as string[][]).slice(1).map(page => page.join('\n'));

describe('attendance report unit scope', () => {
  it('includes only the selected section and excludes sibling sections', () => {
    const profile = student({ academic_assignment: { terminalGroupId: 'a', nodePathIds: ['campus', 'shs', 'a'] } });
    expect(studentBelongsToReportUnit(profile, 'a', nodes)).toBe(true);
    expect(studentBelongsToReportUnit(profile, 'b', nodes)).toBe(false);
  });
  it('uses directory IDs before legacy labels and excludes other units', () => {
    const profile = student({ department: 'College', academic_assignment: { terminalGroupId: 'a', nodePathIds: ['campus', 'shs', 'a'] } });
    expect(studentBelongsToReportUnit(profile, 'shs', nodes)).toBe(true);
    expect(studentBelongsToReportUnit(profile, 'college', nodes)).toBe(false);
  });
  it('resolves legacy assignments without including ambiguous section names', () => {
    expect(studentBelongsToReportUnit(student({ department: 'College', section: 'A' }), 'college', nodes)).toBe(true);
    expect(studentBelongsToReportUnit(student({ section: 'A' }), 'shs', nodes)).toBe(false);
  });
});

describe('attendance report PDF', () => {
  it('keeps a small report on one page and includes every status, distinct students, and Manila time', () => {
    const doc = createAttendanceReport(options, Date.parse('2026-10-09T00:00:00Z'));
    const content = pages(doc).join('\n');
    expect(doc.getNumberOfPages()).toBe(1);
    for (const label of ['Senior High School', 'Excused', 'No record', 'Juan Dela Cruz', '60.0%', 'Page 1 of 1', 'Asia/Manila', '8:00:00 AM']) expect(content).toContain(label);
    expect(content).toContain('(1) Tj');
    expect(content).toContain('(5) Tj');
  });
  it('shows an empty state without invalid percentages', () => {
    const content = pages(createAttendanceReport({ ...options, records: [] })).join('\n');
    expect(content).toContain('No attendance records match');
    expect(content).toContain('No attendance entries to visualize');
    expect(content).not.toMatch(/NaN|Infinity/);
  });
  it('paginates a long ledger with repeated headings and page counts', () => {
    const records = Array.from({ length: 100 }, (_, index) => ({ ...options.records[0], eventTitle: `Activity ${index + 1}: A long morning ceremony attendance window` }));
    const doc = createAttendanceReport({ ...options, records, groupBy: 'section' });
    const content = pages(doc);
    expect(content.length).toBeGreaterThan(2);
    content.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} of ${content.length}`);
      expect(page).toContain('Senior High School');
      expect(page).toContain('/I0 Do');
    });
    expect(content.join('\n')).toContain('Activity 100:');
    expect(content.join('\n')).toContain('Distribution by section');
  });
});
