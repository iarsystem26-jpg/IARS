import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAttendanceTranscript, type AttendanceTranscript } from './attendanceTranscript';

const logo = new Uint8Array(readFileSync('public/academic-seal-transparent.png'));
const generatedAt = new Date('2026-10-08T04:09:00Z');
const sample: AttendanceTranscript = {
  schoolName: 'RIZAL MEMORIAL COLLEGES, INC., TAGUM CAMPUS',
  student: { name: 'Juan Dela Cruz', id: '2025-00047A', department: 'College Department', section: '2SP - B' },
  attendanceRate: 100,
  sanctionHours: 0,
  records: [{ date: '2026-10-03', title: 'Intramurals 2026 / Morning Session', category: 'Event', timeIn: '08:08 AM', status: 'present', scannedBy: 'Regal Admin' }],
  sanctions: [],
};

describe('attendance transcript PDF', () => {
  it('wraps a long school name within the page and moves records below the header', () => {
    const schoolName = 'RIZAL MEMORIAL COLLEGES, INC., TAGUM CAMPUS AND REGIONAL CENTER FOR ADVANCED SCIENCE AND TECHNOLOGY';
    const doc = createAttendanceTranscript({ ...sample, schoolName }, logo, generatedAt);
    const content = doc.internal.pages.slice(1).flat().join('\n');
    const lastTable = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable;
    expect(doc.getNumberOfPages()).toBe(1);
    expect(content).toContain('TECHNOLOGY');
    expect(content).toContain('Juan Dela Cruz');
    expect(content).not.toContain('(RIZAL MEMORIAL COLLEGES)');
    expect(lastTable.finalY).toBeGreaterThan((createAttendanceTranscript(sample, logo, generatedAt) as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY);
    doc.setFont('helvetica', 'bold').setFontSize(17);
    const maxWidth = doc.internal.pageSize.getWidth() - 61;
    const lines: string[] = doc.splitTextToSize(schoolName, maxWidth);
    expect(lines.length).toBeGreaterThan(2);
    lines.forEach(line => expect(doc.getTextWidth(line)).toBeLessThanOrEqual(maxWidth));
  });

  it('includes the seal, readable student records, an empty ledger, and the Manila generation time', () => {
    const doc = createAttendanceTranscript(sample, logo, generatedAt);
    const content = doc.internal.pages.slice(1).flat().join('\n');
    expect(doc.getNumberOfPages()).toBe(1);
    expect(content).toContain('/I0 Do');
    expect(content).toContain('Juan Dela Cruz');
    expect(content).toContain('Intramurals 2026 / Morning Session');
    expect(content).toContain('PRESENT');
    expect(content).toContain('No sanctions or demerits on file.');
    expect(content).toContain('SYSTEM-AUTOMATED DOCUMENT');
    expect(content).toContain('12:09 PM');
    expect(content).toContain('Asia/Manila');
    expect(content).toContain('Page 1 of 1');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(215.9);
  });

  it('paginates long ledgers with a seal and automation notice on every page', () => {
    const data = {
      ...sample,
      records: Array.from({ length: 85 }, (_, index) => ({
        ...sample.records[0], title: `Activity ${index + 1}: A long ceremony title with a morning attendance window and detailed description`,
      })),
      sanctions: Array.from({ length: 30 }, (_, index) => ({
        dateAssigned: '2026-10-03', reason: `Infraction ${index + 1}`, hours: 2, status: 'active', approvedBy: 'OSS A Officer',
      })),
    };
    const doc = createAttendanceTranscript(data, logo, generatedAt);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    // jsPDF's declarations describe pages as numbers; its runtime stores PDF command arrays.
    const pages = (doc.internal.pages as unknown as string[][]).slice(1).map(page => page.join('\n'));
    for (const [index, page] of pages.entries()) {
      expect(page).toContain('/I0 Do');
      expect(page).toContain('RIZAL MEMORIAL');
      expect(page).toContain('TAGUM CAMPUS');
      expect(page).toContain('SYSTEM-AUTOMATED DOCUMENT');
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
    }
    const content = pages.join('\n');
    expect(content).toContain('Activity 85:');
    expect(content).toContain('Infraction 30');
    expect(pages.filter(page => page.includes('Activity / Ceremony')).length).toBeGreaterThan(1);
  });

  it('renders an explicit empty state when no attendance or sanctions exist', () => {
    const doc = createAttendanceTranscript({ ...sample, records: [], attendanceRate: 0 }, logo, generatedAt);
    const content = doc.internal.pages.slice(1).flat().join('\n');
    expect(content).toContain('No attendance records on file.');
    expect(content).toContain('No sanctions or demerits on file.');
  });
});
