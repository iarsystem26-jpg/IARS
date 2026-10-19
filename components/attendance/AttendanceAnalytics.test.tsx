import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import AttendanceAnalytics from './AttendanceAnalytics';
import { AnalyticsRecord } from '../../lib/attendanceAnalytics';

afterEach(cleanup);
const now = Date.parse('2026-10-09T12:00:00+08:00');
const records: AnalyticsRecord[] = [
  { id: '1', studentUid: 's1', studentName: 'Ana', eventId: 'e1', eventName: 'Assembly', attendanceDate: now - 86400000 * 4, completed: true, status: 'absent', program: 'STEM', section: 'A', level: '11' },
  { id: '2', studentUid: 's1', studentName: 'Ana', eventId: 'e2', eventName: 'Ceremony', attendanceDate: now - 86400000, completed: true, status: 'absent', program: 'STEM', section: 'A', level: '11' },
  { id: '3', studentUid: 's2', studentName: 'Ben', eventId: 'e2', eventName: 'Ceremony', attendanceDate: now - 86400000, completed: true, status: 'present', program: 'ABM', section: 'A', level: '11' },
];

it('supports grouping, trend intervals and a contextual follow-up list', () => {
  render(<AttendanceAnalytics records={records} period="all" range={{ start: '', end: '' }} now={now} />);
  const groups = screen.getByRole('table', { name: 'Attendance group comparison' });
  expect(within(groups).getByText('Assembly')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /compare by/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Program / strand' }));
  expect(within(groups).getByText('STEM')).toBeInTheDocument();
  expect(within(groups).queryByText('Assembly')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'day' }));
  expect(screen.getByRole('button', { name: 'day' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('table', { name: 'Attendance trend data', hidden: true })).getAllByRole('row', { hidden: true })).toHaveLength(3);
  fireEvent.click(screen.getByText('Review 1 students with repeated absences'));
  expect(screen.getByText('Ana')).toBeVisible();
  expect(screen.getByText('2 absent / 2 resolved entries · 2 events')).toBeVisible();
});

it('recalculates when the academic scope changes and removes stale follow-up flags', () => {
  const view = render(<AttendanceAnalytics records={records} period="all" range={{ start: '', end: '' }} now={now} />);
  expect(screen.getByText('Repeated absences')).toBeInTheDocument();
  view.rerender(<AttendanceAnalytics records={[records[2]]} period="all" range={{ start: '', end: '' }} now={now} />);
  expect(screen.queryByText('Repeated absences')).not.toBeInTheDocument();
  expect(screen.getByText('One time bucket is available.', { exact: false })).toBeInTheDocument();
});

it('explains unavailable analytics rather than displaying invented zero rates', () => {
  render(<AttendanceAnalytics records={[]} period="all" range={{ start: '', end: '' }} now={now} />);
  expect(screen.getByText('No attendance in this scope')).toBeInTheDocument();
  expect(screen.getByText('Resolved entries are needed in both periods.')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Attendance group comparison' })).not.toBeInTheDocument();
});

it('shows attendance from unfinished events and lets the officer choose completed-only results', () => {
  render(<AttendanceAnalytics records={[{ ...records[2], completed: false }]} period="all" range={{ start: '', end: '' }} now={now} />);
  expect(screen.getByRole('status')).toHaveTextContent('Live results: 1 entries from 1 unfinished events');
  expect(screen.getByRole('table', { name: 'Attendance group comparison' })).toBeInTheDocument();
  expect(screen.queryByText('No recorded attendance sessions match these filters.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /analytics coverage/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Completed events only' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Attendance group comparison' })).not.toBeInTheDocument();
  expect(screen.getByText('No completed attendance sessions match these filters.', { exact: false })).toBeInTheDocument();
});
