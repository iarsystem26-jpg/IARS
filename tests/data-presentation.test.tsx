import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AttendanceDashboard from '../views/AttendanceDashboard';
import OSSADashboard from '../views/OSSADashboard';
import ManageMembers from '../views/ManageMembers';
import GeneralEvent from '../views/GeneralEvent';
import ActivityCredits from '../components/attendance/ActivityCredits';

const state = vi.hoisted(() => ({ students: [] as any[], events: [] as any[], history: [] as any[], revision: 1, profile: { uid: 'admin', role: 'admin' }, user: { uid: 'admin' } }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: state.profile, user: state.user, revision: state.revision }) }));
vi.mock('../lib/accessControl', () => ({ hasPermission: () => true }));
vi.mock('../components/ui/ProfileAvatar', () => ({ default: () => <span>Profile</span> }));
vi.mock('../components/events/EventLocationDetails', () => ({ default: () => <p>Location details</p> }));
vi.mock('../lib/backend', () => ({ appData: {
  getVisibleStudents: () => state.students, getVisibleEvents: () => state.events,
  getEvents: () => state.events, getVisibleExcuseApplications: () => [],
  getAttendanceLogs: () => ({}), isEventRecipient: () => true,
  getAttendanceRecords: (uid: string) => [{ id: uid, event: state.events[0], slot: 'default', status: 'present', time_in: Date.parse('2026-10-09T00:00:00Z') + Number(uid.split('-')[1]) * 60000 }],
  getCustomRoles: () => ({}), getCoreRoles: () => ({}),
  getUserDetail: (uid: string) => ({ sanction_logs: state.history, stats: state.students.find(student => student.uid === uid)?.stats }),
  getSchoolStructure: () => [{ id: 'section', name: 'Class A', type: 'section', children: [] }],
  getStudentsBySection: () => state.students, getAllAccountIdentities: () => [],
  getOrganizations: () => [],
} }));

function mount(view: React.ReactNode) { return render(<MemoryRouter>{view}</MemoryRouter>); }
function next(label: string) { fireEvent.click(within(screen.getByRole('navigation', { name: label })).getByRole('button', { name: 'Next page' })); }
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); state.revision = 1;
  state.students = Array.from({ length: 12 }, (_, index) => ({ uid: `student-${index}`, name: `Student ${String(index).padStart(2, '0')}`, student_id: `ID${index}`, email: `student${index}@example.test`, username: `student${index}`, role: 'student', account_status: 'active', school_data: { type: 'College', section: 'Class A', level: '1', department: 'College' }, stats: { sanction_hours: 1, attendance_rate: 0 } }));
  state.events = [{ id: 'event', title: 'Assembly', kind: 'attendance', status: 'active', startTime: Date.parse('2026-10-09T00:00:00Z'), endTime: Date.parse('2026-10-09T04:00:00Z') }];
  state.history = Array.from({ length: 12 }, (_, index) => ({ id: `log-${index}`, reason: `Adjustment ${index}`, change: 1, timestamp: Date.parse('2026-10-09T00:00:00Z') + index * 60000, performed_by: 'Director' }));
});
afterEach(cleanup);

it('sorts admin attendance newest first, paginates both layouts and refreshes on revision', () => {
  const view = mount(<AttendanceDashboard />);
  const table = screen.getByRole('table', { name: 'Attendance records' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Student 11');
  next('Admin attendance pagination');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  state.students = []; state.revision++;
  view.rerender(<MemoryRouter><AttendanceDashboard /></MemoryRouter>);
  expect(within(screen.getByRole('navigation', { name: 'Admin attendance pagination' })).getByText('0 records')).toBeInTheDocument();
});

it('paginates the roster and newest sanction history, resets search, and preserves a zero attendance rate', () => {
  mount(<OSSADashboard section="sanctions" />);
  const table = screen.getByRole('table', { name: 'Student sanction roster' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('0%');
  next('Sanction roster pagination');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  fireEvent.click(within(table).getByRole('button', { name: 'Manage Student 11' }));
  const dialog = screen.getByRole('dialog');
  const history = within(dialog).getByRole('region', { name: 'Sanction history' });
  expect(within(history).getAllByRole('listitem')).toHaveLength(5);
  expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('Adjustment 11');
  next('Sanction history pagination');
  expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('Adjustment 6');
  expect(within(dialog).queryByText('0917-123-4567')).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search student sanctions' }), { target: { value: 'Student 02' } });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(screen.getByRole('navigation', { name: 'Sanction roster pagination' })).getByText('Page 1 of 1')).toBeInTheDocument();
});

it('loads the member registry without changing hook order, paginates and resets when searching', () => {
  mount(<ManageMembers />);
  const table = screen.getByRole('table', { name: 'Class A member registry' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  next('Member registry pagination');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search section members' }), { target: { value: 'Student 02' } });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
});

it('paginates credits newest first with readable session names and opens the existing record details', () => {
  const onOpen = vi.fn();
  const records = state.history.map((log, index) => ({ id: log.id, event: { ...state.events[0], attendanceWindows: [{ id: 'morning', label: 'Morning session' }] }, slot: '2026-10-09:morning', time_in: log.timestamp, time_out: index ? log.timestamp + 3600000 : undefined, rendered_hours: 1 }));
  mount(<ActivityCredits records={records} uid="student" onOpen={onOpen} />);
  const table = screen.getByRole('table', { name: 'Service and merit credits' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  fireEvent.click(within(table).getAllByRole('button')[0]);
  expect(onOpen).toHaveBeenCalledWith('log-11');
  expect(within(table).queryByText('2026-10-09:morning')).not.toBeInTheDocument();
  next('Service and merit pagination');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getByText('Awaiting scan-out')).toBeInTheDocument();
});

it('groups general event details into labelled fields and orders attendance windows chronologically', () => {
  state.events = [{ ...state.events[0], id: 'general', isGeneralEvent: true }, { ...state.events[0], parentEventId: 'general', title: 'Activity', attendanceWindows: [{ id: 'late', label: 'Later session', timeIn: '10:00', timeOut: '11:00', lateAfterMinutes: 5 }, { id: 'early', label: 'Early session', timeIn: '08:00', timeOut: '09:00', lateAfterMinutes: 10 }], penaltyValue: 1, penaltyUnit: 'hours' }];
  render(<MemoryRouter initialEntries={['/ssg/events/general']}><Routes><Route path="/ssg/events/:eventId" element={<GeneralEvent />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /Activity.*View activity details/ }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getAllByRole('heading', { level: 4 }).map(node => node.textContent)).toEqual(['Early session', 'Later session']);
  expect(within(dialog).getAllByText('Late after')).toHaveLength(2);
  expect(within(dialog).getByText('Recipients')).toBeInTheDocument();
  expect(within(dialog).getByText('1 hours')).toBeInTheDocument();
});
