import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ClassStudentDetail from './ClassStudentDetail';

const state = vi.hoisted(() => ({ role: 'admin', visible: true, detail: vi.fn() }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'admin', role: state.role }, revision: 1 }) }));
vi.mock('../components/ui/ProfileAvatar', () => ({ default: (props: any) => <img {...props} /> }));
vi.mock('../components/members/ProfileRequests', () => ({ default: ({ studentUid }: any) => <p>Information history for {studentUid}</p> }));
vi.mock('./StudentRecords', () => ({ default: ({ student, studentStats }: any) => <p>Records for {student.uid}, balance {studentStats.sanction_hours}</p> }));
vi.mock('../lib/backend', () => {
  const student = { uid: 'student-1', name: 'Jane Student', student_id: '26-0001-001', username: 'jane', role: 'student', account_status: 'active', email: 'jane@example.com', photo_url: '/jane.jpg', guardian: { name: 'Jane Guardian' }, school_data: { type: 'College', level: '2', section: 'Class A', academic_assignment: { terminalGroupId: 'class-a' } } };
  const nodes = [{ id: 'campus', type: 'campus', name: 'Campus', children: [{ id: 'class-a', type: 'block', name: 'Class A' }] }];
  return { appData: {
    getVisibleStudents: () => state.visible ? [student] : [],
    getUserDetail: (uid: string) => { state.detail(uid); return { profile: student, stats: { sanction_hours: 3, merit_hours: 2 }, sanction_logs: [], excuse_applications: [{ id: 'excuse-1', event_title: 'Foundation day', category: 'medical', reason: 'Medical consultation', status: 'pending', submission_date: 1791507600000 }] }; },
    getSchoolStructure: () => nodes, getVisibleSchoolStructure: () => nodes,
    getAttendanceRecords: () => [{ status: 'present', slot: '2026-10-09:morning' }, { status: 'absent', slot: '2026-10-09:afternoon' }, { status: 'present', slot: '2026-10-09:service', event: { kind: 'service' } }],
    getOrganizations: () => [], getOrganizationMemberships: () => [], getOrganizationSanctions: () => [], getVisibleApplications: () => [],
  }, documentUrl: vi.fn() };
});
afterEach(() => { cleanup(); state.role = 'admin'; state.visible = true; vi.clearAllMocks(); });
const mount = (uid = 'student-1') => render(<MemoryRouter initialEntries={[`/ssg/panel/students/${uid}?unit=class-a`]}><Routes><Route path="/ssg/panel/students/:studentUid" element={<ClassStudentDetail />} /></Routes></MemoryRouter>);

it('shows the selected student, analytics excluding service, and a class return link', () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Jane Student' })).toBeInTheDocument();
  expect(within(screen.getByText('Attendance rate').closest('section')!).getByText('50%')).toBeInTheDocument();
  expect(screen.getByText('2 recorded attendance sessions')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to class' })).toHaveAttribute('href', '/admin/hierarchy?unit=class-a');
  expect(within(screen.getByRole('region', { name: 'Monthly attendance trend' })).getByText('Oct 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Profile information' }));
  expect(screen.getByText('Jane Guardian')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Parent / guardian' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'jane@example.com' })).toHaveAttribute('href', 'mailto:jane@example.com');
});
it('opens request details and passes the selected student to records', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Requests' }));
  expect(screen.getByText('Information history for student-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Excuse.*Foundation day/ }));
  expect(within(screen.getByRole('dialog')).getByText('Medical consultation')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search student requests' }), { target: { value: 'unmatched request' } });
  expect(screen.getByText('No matching requests')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Attendance & sanctions' }));
  expect(screen.getByText('Records for student-1, balance 3')).toBeInTheDocument();
});
it('does not retrieve a student outside the visible roster', () => {
  mount('outside-scope');
  expect(screen.getByRole('heading', { name: 'Student unavailable' })).toBeInTheDocument();
  expect(state.detail).not.toHaveBeenCalled();
  expect(screen.queryByText('Jane Guardian')).not.toBeInTheDocument();
});
it('explains restricted profile requests to class officers', () => {
  state.role = 'mayor'; mount();
  fireEvent.click(screen.getByRole('button', { name: 'Requests' }));
  expect(screen.getByText(/Information request history is available to OSSA/)).toBeInTheDocument();
  expect(screen.queryByText('Information history for student-1')).not.toBeInTheDocument();
});
