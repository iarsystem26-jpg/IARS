import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AttendanceConfirmation from './AttendanceConfirmation';

const state = vi.hoisted(() => ({ uid: 'student', revision: 1, records: [] as any[] }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { uid: state.uid, name: 'Jane Student' }, revision: state.revision }) }));
vi.mock('../../lib/backend', () => ({ appData: { getAttendanceRecords: () => state.records, getEvents: () => [] } }));
vi.mock('./RecordedBy', () => ({ default: ({ name }: { name: string }) => <p>{name}</p> }));
afterEach(() => { cleanup(); state.uid = 'student'; state.revision = 1; state.records = []; });

const record = { id: 'event:morning', slot: 'morning', status: 'late', time_in: Date.parse('2026-10-09T00:26:00Z'), scanned_by_name: 'Dr. Santos', event: { title: 'Assembly', venue: 'Gym' } };
it('shows only newly saved scans, with the verifier and saved details, and ignores repeated refreshes', () => {
  const view = render(<AttendanceConfirmation />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  state.records = [record]; state.revision++;
  view.rerender(<AttendanceConfirmation />);
  const dialog = screen.getByRole('dialog', { name: 'Attendance saved successfully' });
  expect(within(dialog).getByText('Dr. Santos')).toBeInTheDocument();
  expect(within(dialog).getByText('Gym')).toBeInTheDocument();
  expect(within(dialog).getByText('Attendance status: late')).toBeInTheDocument();
  expect(within(dialog).getByText('10/9/2026, 8:26:00 AM')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  state.revision++; view.rerender(<AttendanceConfirmation />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  state.records = [{ ...record, time_out: Date.parse('2026-10-09T01:00:00Z') }]; state.revision++;
  view.rerender(<AttendanceConfirmation />);
  expect(screen.getByText('Check-out recorded')).toBeInTheDocument();
});

it('does not announce history on mount or show the previous account receipt after switching accounts', () => {
  state.records = [record];
  const view = render(<AttendanceConfirmation />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  state.records = [...state.records, { ...record, id: 'second' }]; state.revision++;
  view.rerender(<AttendanceConfirmation />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  state.uid = 'another-student'; state.records = []; state.revision++;
  view.rerender(<AttendanceConfirmation />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
