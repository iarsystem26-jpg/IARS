import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StudentRecords from './StudentRecords';
import { appData } from '../lib/backend';

const state = vi.hoisted(() => ({ extra: [] as any[] }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'student-1' }, revision: 1, stats: {} }) }));
vi.mock('../lib/backend', () => {
  const event = { id: 'event-1', title: 'Intramurals', kind: 'attendance', startTime: Date.parse('2026-10-02T16:00:00Z'), endTime: Date.parse('2026-10-03T09:00:00Z'), venue: 'RMC Gym', attendanceWindows: [{ id: 'morning', label: 'Morning session' }] };
  return { subscribeData: () => () => {}, appData: {
    getAttendanceRecords: () => [{ id: 'record-1', event, slot: '2026-10-03:morning', status: 'present', time_in: Date.parse('2026-10-02T16:08:02Z'), time_out: Date.parse('2026-10-03T04:00:00Z'), scanned_by_name: 'Regal Admin', rendered_hours: 2 }, ...state.extra],
    getEvents: () => [event],
    getUserDetail: () => ({ sanction_logs: [{ id: 'sanction-1', reason: 'Late attendance', change: 1, timestamp: Date.parse('2026-10-02T16:08:02Z'), performed_by: 'Regal Admin' }] }),
  } };
});
afterEach(() => { cleanup(); sessionStorage.clear(); state.extra = []; });
vi.mock('../components/attendance/RecordedBy', () => ({ default: ({ name }: { name: string }) => <span>{name}</span> }));

it('loads the selected class student records and balance instead of the signed-in user', () => {
  const attendance = vi.spyOn(appData, 'getAttendanceRecords');
  const details = vi.spyOn(appData, 'getUserDetail');
  render(<MemoryRouter><StudentRecords embedded student={{ uid: 'selected-student' } as any} studentStats={{ sanction_hours: 7, merit_hours: 3, attendance_rate: 100, events_attended: 1, events_missed: 0 }} /></MemoryRouter>);
  expect(attendance).toHaveBeenCalledWith('selected-student');
  expect(attendance).not.toHaveBeenCalledWith('student-1');
  expect(details).toHaveBeenCalledWith('selected-student');
  expect(screen.getByText('7 hours')).toBeInTheDocument();
  expect(screen.getByText('3 hours')).toBeInTheDocument();
  expect(screen.queryByRole('main')).not.toBeInTheDocument();
  attendance.mockRestore(); details.mockRestore();
});

it('opens attendance details from a mobile card and closes with Escape', () => {
  render(<MemoryRouter><StudentRecords /></MemoryRouter>);
  const card = screen.getByRole('button', { name: 'Intramurals / Morning session' });
  expect(within(card).getByText('12:08:02 AM')).toBeInTheDocument();
  card.focus();
  fireEvent.keyDown(card, { key: 'Enter' });
  const dialog = screen.getByRole('dialog', { name: 'Attendance details' });
  expect(within(dialog).getByText('RMC Gym')).toBeInTheDocument();
  expect(within(dialog).getByText('10/3/2026, 12:00:00 PM')).toBeInTheDocument();
  expect(within(dialog).getByText('Regal Admin')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(card).toHaveFocus();
});

it('opens attendance details from the desktop title and sanction details from its card', () => {
  render(<MemoryRouter><StudentRecords /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /Intramurals.*View details/i }));
  expect(screen.getByRole('dialog', { name: 'Attendance details' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  fireEvent.click(screen.getByRole('button', { name: 'View sanction details: Late attendance' }));
  const dialog = screen.getByRole('dialog', { name: 'Sanction details' });
  expect(within(dialog).getByText('10/3/2026, 12:08:02 AM')).toBeInTheDocument();
  expect(within(dialog).getByText('+1 hour')).toBeInTheDocument();
});

it('sorts newest first, paginates both layouts and resets the page when searching', () => {
  state.extra = Array.from({ length: 12 }, (_, index) => ({ id: `new-${index}`, event: { id: `e-${index}`, title: `Activity ${index}`, kind: 'attendance', startTime: Date.parse('2026-10-09T00:00:00Z') }, slot: '2026-10-09:morning', status: 'present', time_in: Date.parse('2026-10-09T00:00:00Z') + index * 60000, scanned_by_name: 'Verifier' }));
  render(<MemoryRouter><StudentRecords /></MemoryRouter>);
  const table = screen.getByRole('table', { name: 'Attendance ledger' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Activity 11');
  expect(screen.queryByRole('button', { name: /Intramurals.*View details/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(screen.getByRole('button', { name: /Intramurals.*View details/i })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search attendance records' }), { target: { value: 'Activity 11' } });
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});


it('orders default sessions across months using the actual scan date', () => {
  state.extra = [
    { id: 'september', event: { title: 'September activity', startTime: Date.parse('2026-09-30T00:00:00Z') }, slot: 'default', status: 'present', time_in: Date.parse('2026-09-30T00:00:00Z') },
    { id: 'october', event: { title: 'October activity', startTime: Date.parse('2026-10-01T00:00:00Z') }, slot: 'default', status: 'present', time_in: Date.parse('2026-10-09T00:00:00Z') },
  ];
  render(<MemoryRouter><StudentRecords /></MemoryRouter>);
  const rows = within(screen.getByRole('table', { name: 'Attendance ledger' })).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('October activity');
  expect(rows[1]).toHaveTextContent('10/9/2026');
  expect(rows[3]).toHaveTextContent('September activity');
});
