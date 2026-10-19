import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClearanceCertificatePdf } from './clearanceCertificatePdf';
import type { ClearanceCertificate } from './clearanceCertificates';

const logo = new Uint8Array(readFileSync('public/academic-seal-transparent.png'));
const qr = `data:image/png;base64,${readFileSync('public/academic-seal-transparent.png').toString('base64')}`;
const c: ClearanceCertificate = {
 id: 'certificate', token: 'a'.repeat(64), reference: 'CLR-TEST', issued_at: '2026-10-09T16:30:00Z', cleared_at: '2026-10-09T15:00:00Z',
 details: { student_name: 'Juan Dela Cruz', student_number: '2026-001', school_name: 'RMC Test School', period_title: 'First semester clearance',
  starts_at: '2026-10-08T16:00:00Z', ends_at: '2026-10-10T15:59:00Z', authorized_by: 'OSSA Reviewer' },
};
describe('clearance certificate PDF', () => {
 it('uses one A4 landscape page with server identity, reference, Manila dates, seal and verification link', () => {
  const doc = createClearanceCertificatePdf(c, qr, 'https://school.example/#/verify/clearance/token', logo);
  const content = doc.internal.pages.slice(1).flat().join('\n');
  expect(doc.getNumberOfPages()).toBe(1);
  expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
  expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
  for (const text of ['Certificate of Clearance', 'OFFICE OF THE STUDENTS SERVICES AND AFFAIRS', 'Juan Dela Cruz', '2026-001', 'CLR-TEST', 'October 10, 2026', 'OSSA Reviewer', 'SCAN TO VERIFY', '/I0 Do', '/I1 Do']) expect(content).toContain(text);
  expect(doc.output()).toContain('https://school.example/#/verify/clearance/token');
 });
 it('embeds the Old English typeface for the school, title and student name', () => {
  const font = new Uint8Array(readFileSync('public/fonts/UnifrakturMaguntia-Book.ttf'));
  const doc = createClearanceCertificatePdf(c, qr, 'https://school.example/verify', logo, font);
  expect(doc.getFontList().OldEnglish).toEqual(['normal']);
  expect(doc.getNumberOfPages()).toBe(1);
 });
 it('keeps lengthy school names, student names and authority on a single page', () => {
  const doc = createClearanceCertificatePdf({ ...c, details: { ...c.details, student_name: 'Alexandra '.repeat(22), school_name: 'School '.repeat(32), authorized_by: 'Reviewer '.repeat(22) } }, qr, 'https://school.example/verify');
  expect(doc.getNumberOfPages()).toBe(1);
 });
});
