import { describe, expect, it } from 'vitest';
import { createCalendarPdf } from './calendarPdf';
import type { CalendarItem } from './personalCalendar';
import { readFileSync } from 'node:fs';

const item: CalendarItem = { id: 'session', event_id: 'event', title: 'Opening program', label: 'Morning window', starts_at: '2026-10-08T23:00:00Z', ends_at: '2026-10-09T01:00:00Z', kind: 'attendance', organization_id: null, general: false, cancelled: false, suspended: false, venue: 'Main Gym', description: '' };
describe('calendar PDF', () => {
 it('labels informational schedules as requiring no attendance', () => {
  const notice = { ...item, kind: 'informational', label: 'No attendance required' };
  const doc = createCalendarPdf('2026-10', [notice], [], 'Informational schedules');
  const content = doc.internal.pages.slice(1).flat().join('\n');
  expect(content).toContain('(No attendance required)');
  expect(content).toContain('(Informational - no attendance)');
 });
 it('puts a visually distinct general event before its children and repeats branding in the header', () => {
  const child = { ...item, parent_event_id: 'parent' };
  const parent = { ...item, id: 'parent', event_id: 'parent', title: 'School Week', general: true };
  const doc = createCalendarPdf('2026-10', [child, parent], [], 'All activities', Date.now(), { unitName: 'College Department', logo: new Uint8Array(readFileSync('public/academic-seal-transparent.png')) });
  const agenda = (doc.internal.pages as unknown as string[][]).slice(2, 3).flat().join('\n');
  expect(agenda.indexOf('(School Week)')).toBeLessThan(agenda.indexOf('(Specific activity: Opening program)'));
  expect(agenda).toContain('College Department');
  expect(agenda).toContain('SYSTEM GENERATED');
  expect(agenda).toContain('/I0 Do');
  expect(agenda).toContain('1. 0.96 0.84 rg');
 });
 it('renders the monthly grid and preserves full agenda details and notice status', () => {
  const doc = createCalendarPdf('2026-10', [item, { ...item, id: 'cancelled', title: 'Cancelled program', cancelled: true }], [{ id: 'notice', title: 'Weather suspension', reason: 'Heavy rainfall', kind: 'suspension', starts_on: '2026-10-10', ends_on: '2026-10-10' }], 'All activities', Date.parse('2026-10-09T04:00:00Z'));
  const content = doc.internal.pages.slice(1).flat().join('\n');
  expect(doc.getNumberOfPages()).toBe(2);
  expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
  for (const value of ['October 2026', 'Sunday', 'Saturday', 'Opening program', 'Morning window', 'Main Gym', 'Cancelled program', 'Cancelled', 'Heavy rainfall', '7:00 AM']) expect(content).toContain(value);
 });
 it('keeps crowded dates compact and paginates the complete agenda', () => {
  const items = Array.from({ length: 80 }, (_, index) => ({ ...item, id: `id-${index}`, event_id: `event-${index}`, title: `Program ${index + 1} with a long descriptive title` }));
  const doc = createCalendarPdf('2026-10', items, [], 'All activities');
  const content = doc.internal.pages.slice(1).flat().join('\n');
  expect(doc.getNumberOfPages()).toBeGreaterThan(2);
  expect(content).toContain('more - see agenda');
  expect(content).toContain('Program 80 with a long descriptive title');
  expect(content).toContain('DETAILED AGENDA / CONTINUED');
 });
 it('supports an empty month and rejects invalid months', () => {
  expect(createCalendarPdf('2026-02', [], [], 'Service').internal.pages.slice(1).flat().join('\n')).toContain('No activities or notices');
  expect(() => createCalendarPdf('2026-13', [], [], 'All activities')).toThrow();
 });
});
