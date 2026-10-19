import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AttendanceDashboard from './AttendanceDashboard';

const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), logo: vi.fn(), spreadsheet: vi.fn(), complete: vi.fn(), fail: vi.fn(), role: 'admin', allowed: true }));
vi.mock('../lib/attendanceSpreadsheet', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/attendanceSpreadsheet')>(), downloadAttendanceWorkbook: mocks.spreadsheet,
}));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'officer', role: mocks.role }, revision: 1 }) }));
vi.mock('../lib/attendanceReport', () => ({ createAttendanceReport: mocks.create, loadAttendanceReportLogo: mocks.logo }));
vi.mock('../lib/accessControl', () => ({ hasPermission: () => mocks.allowed }));
vi.mock('../lib/toast', () => ({ toast: {
  track: async (fn: () => Promise<void>) => fn(),
  start: () => ({ complete: mocks.complete, fail: mocks.fail }),
} }));
vi.mock('../lib/backend', () => {
  const event = { id: 'event', title: 'Assembly', startTime: Date.parse('2026-10-09T00:00:00Z'), status: 'done' };
  return { appData: {
    getVisibleEvents: () => [event], getEvents: () => [event],
    getSchoolStructure: () => [{ id: 'campus', name: 'Campus', type: 'campus', children: [
      { id: 'shs', name: 'Senior High School', type: 'education_unit', children: [{ id: 'grade11', name: 'Grade 11', type: 'grade_level', children: [{ id: 'shs-a', name: 'Section A', type: 'section' }, { id: 'shs-b', name: 'Section B', type: 'section' }] }] },
      { id: 'college', name: 'College', type: 'education_unit' },
    ] }],
    getVisibleStudents: () => ['shs-a', 'shs-b', 'college'].map(id => ({ uid: id, name: `${id} student`, student_id: id,
      school_data: { type: 'College', level: '1', section: 'A', academic_assignment: { terminalGroupId: id, nodePathIds: id === 'college' ? ['campus', id] : ['campus', 'shs', 'grade11', id] } },
    })),
    getAttendanceLogs: () => ({}), isEventRecipient: () => true,
    getAttendanceRecords: (uid: string) => [{ id: uid, event, slot: 'default', status: 'present', time_in: event.startTime }],
  } };
});
const createUrl = vi.fn();
const revokeUrl = vi.fn();
beforeEach(() => {
  createUrl.mockImplementation(() => `blob:report-${createUrl.mock.calls.length}`);
  revokeUrl.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  mocks.logo.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.create.mockReturnValue({ save: mocks.save, output: () => new Blob(['pdf'], { type: 'application/pdf' }), getNumberOfPages: () => 1 });
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); mocks.allowed = true; });

it('exports dashboard entries and filter scope to Excel and recovers from a failed download', async () => {
  render(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Export Excel report' });
  mocks.spreadsheet.mockRejectedValueOnce(new Error('Could not create workbook'));
  fireEvent.click(button);
  await waitFor(() => expect(mocks.fail).toHaveBeenCalledOnce());
  expect(button).toBeEnabled();
  mocks.spreadsheet.mockResolvedValueOnce(undefined);
  fireEvent.click(button);
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith('Excel report download started'));
  expect(mocks.spreadsheet.mock.calls[1][0].records).toHaveLength(3);
  expect(mocks.spreadsheet.mock.calls[1][0].scope).toContain('Period: All time | Events: All events');
});

it.each(['admin', 'ossa', 'ossa_staff', 'ssg', 'custom-officer'])('lets an authorized %s select a specific section using the enrollment picker', async role => {
  mocks.role = role;
  render(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Export report' }));
  const download = screen.getByRole('button', { name: 'Generate PDF report' });
  expect(download).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /campus.*select campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Campus' }));
  expect(download).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /education unit.*all of campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Senior High School' }));
  expect(screen.getByText('2 attendance entries match this unit and your current filters.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /grade level.*all of senior high/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Grade 11' }));
  fireEvent.click(screen.getByRole('button', { name: /section.*all of grade 11/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Section A' }));
  await waitFor(() => expect(download).toBeEnabled());
  expect(screen.getByText('1 attendance entries match this unit and your current filters.')).toBeInTheDocument();
  const scopePanel = screen.getByRole('heading', { name: 'Current report scope' }).closest('section')!;
  expect(within(scopePanel).getByText('Grade 11', { exact: true })).toBeInTheDocument();
  expect(within(scopePanel).getByText('No additional restriction')).toBeInTheDocument();
  expect(within(scopePanel).queryByText('All levels')).not.toBeInTheDocument();
  fireEvent.click(download);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const report = mocks.create.mock.calls[0][0];
  expect(report.schoolLogo).toEqual(new Uint8Array([1, 2, 3]));
  expect(report.scope).toContain('Campus / Senior High School / Grade 11 / Section A');
  expect(report.scope).not.toContain('Education level: all');
  expect(report.schoolName).toBe('Senior High School');
  expect(report.records.map((record: { studentUid: string }) => record.studentUid)).toEqual(['shs-a']);
  expect(mocks.save).toHaveBeenCalledWith('attendance_report_campus_senior_high_school_grade_11_section_a.pdf', { returnPromise: true });
});

it('disables reporting when the officer lacks attendance.manage', () => {
  mocks.allowed = false;
  render(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Export report' })).toBeDisabled();
});

async function chooseUnit() {
  fireEvent.click(screen.getByRole('button', { name: 'Export report' }));
  fireEvent.click(screen.getByRole('button', { name: /campus.*select campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Campus' }));
  fireEvent.click(screen.getByRole('button', { name: /education unit.*all of campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Senior High School' }));
  await waitFor(() => expect(screen.getByTitle('Attendance PDF preview')).toBeInTheDocument());
}

it('shows the exact PDF, refreshes contents, and frees preview URLs when closed', async () => {
  render(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  await chooseUnit();
  expect(screen.getByTitle('Attendance PDF preview')).toHaveAttribute('src', 'blob:report-1#toolbar=0&navpanes=0&view=FitH');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByText('All dates and times use Asia/Manila (UTC+8).', { exact: false })).toBeInTheDocument();
  const download = screen.getByRole('button', { name: 'Generate PDF report' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include Visualizations' }));
  expect(download).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Group data by' })).toBeDisabled();
  await waitFor(() => expect(download).toBeEnabled());
  expect(mocks.create.mock.calls.at(-1)?.[0].includeCharts).toBe(false);
  expect(mocks.create.mock.calls.at(-1)?.[0].records).toHaveLength(2);
  expect(mocks.logo).toHaveBeenCalledOnce();
  expect(revokeUrl).toHaveBeenCalledWith('blob:report-1');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByTitle('Attendance PDF preview')).not.toBeInTheDocument();
  expect(revokeUrl).toHaveBeenCalledWith('blob:report-2');
});

it('explains preview failure and lets the officer retry before downloading', async () => {
  mocks.logo.mockRejectedValueOnce(new Error('School logo could not be loaded.'));
  render(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Export report' }));
  fireEvent.click(screen.getByRole('button', { name: /campus.*select campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Campus' }));
  fireEvent.click(screen.getByRole('button', { name: /education unit.*all of campus/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Senior High School' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
  expect(screen.getByRole('button', { name: 'Generate PDF report' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate PDF report' })).toBeEnabled());
  expect(screen.getByTitle('Attendance PDF preview')).toBeInTheDocument();
});
