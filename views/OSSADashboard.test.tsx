import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OSSADashboard from './OSSADashboard';
const state = vi.hoisted(() => ({ permissions: ['ossa.manage_cases', 'events.approve'], profile: { uid: 'officer', role: 'ossa' }, events: [] as any[], organizations: [] as any[], sanctions: [] as any[], students: [] as any[], excuses: [] as any[], requests: [] as any[] }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: state.profile, user: { uid: 'officer' } }) }));
vi.mock('../lib/accessControl', () => ({ hasPermission: (_: unknown, permission: string) => state.permissions.includes(permission) }));
vi.mock('../lib/backend', () => ({ refreshData: vi.fn(async () => {}), appData: { getPaymentInfo: () => ({ reminders: [] }), getAllStudents: () => state.students, getExcuseApplications: () => state.excuses, getCustomRoles: () => [], getCoreRoles: () => [], getOrganizations: () => state.organizations, getEvents: () => state.events, getOrganizationSanctions: () => state.sanctions } }));
vi.mock('../lib/profileRequests', () => ({ loadProfileRequests: vi.fn(async () => state.requests) }));
vi.mock('../lib/attendanceCorrections', () => ({ loadAttendanceCorrections: vi.fn(async () => []) }));
vi.mock('../components/attendance/AttendanceCorrections', () => ({ default: () => <div>Attendance correction review queue</div> }));
vi.mock('../components/events/ActivityApprovalQueue', () => ({ default: () => <div>Activity review queue</div> }));
vi.mock('../components/members/ProfileRequests', () => ({ default: () => <div>Student information review queue</div> }));
beforeEach(() => { state.permissions = ['ossa.manage_cases', 'events.approve']; state.events = []; state.organizations = []; state.sanctions = []; state.students = []; state.excuses = []; state.requests = []; });
afterEach(() => { cleanup(); });
const renderPage = (section?: Parameters<typeof OSSADashboard>[0]['section']) => render(<MemoryRouter><OSSADashboard section={section} /></MemoryRouter>);
it('shows pending badges in scope and clears them after requests are reviewed', async () => {
 state.events = [
  { id: 'pending', requiresOssaApproval: true, approvalStatus: 'pending', organizationId: 'visible' },
  { id: 'cancelled', requiresOssaApproval: true, approvalStatus: 'pending', cancellationStatus: 'pending' },
  { id: 'approved', requiresOssaApproval: true, approvalStatus: 'approved' },
 ];
 state.organizations = [{ id: 'visible', can_review: true }];
 state.sanctions = [{ organization_id: 'visible', status: 'pending' }, { organization_id: 'hidden', status: 'pending' }];
 state.requests = [{ status: 'pending' }, { status: 'partially_approved' }];
 state.excuses = [{ status: 'pending' }, { status: 'approved' }];
 state.students = [{ uid: 'student', name: 'Student', stats: { sanction_hours: 2 } }];
 renderPage();
 const card = (name: string) => within(screen.getByRole('link', { name: new RegExp(name + '.*Open workspace', 'i') }));
 expect(card('Event & ceremony approvals').getByLabelText('1 pending requests')).toHaveTextContent('1');
 expect(card('Organization approvals').getByLabelText('2 pending requests')).toHaveTextContent('2');
 expect(card('Excuse applications').getByLabelText('1 pending requests')).toHaveTextContent('1');
 expect(card('Student sanctions & analytics').getByLabelText('1 students with active sanctions')).toHaveTextContent('1');
 await waitFor(() => expect(card('Student information requests').getByLabelText('1 pending requests')).toHaveTextContent('1'));
 state.requests = [{ status: 'approved' }]; state.events = []; state.sanctions = []; state.excuses = []; state.students = [];
 act(() => { window.dispatchEvent(new Event('rmc_data_update')); });
 await waitFor(() => expect(screen.queryAllByLabelText(/pending requests|students with active sanctions/)).toHaveLength(0));
});
it('organizes the hub into linked workspaces without embedding queues or charts', () => {
 renderPage();
 expect(screen.getByRole('heading', { name: 'OSSA Hub' })).toBeVisible();
 const pages = { 'Event & ceremony approvals': 'activities', 'Student information requests': 'requests', 'Student sanctions & analytics': 'sanctions', 'Excuse applications': 'excuses', 'Attendance corrections': 'corrections', 'Organization approvals': 'organizations' };
 for (const [name, path] of Object.entries(pages)) expect(screen.getByRole('link', { name: new RegExp(name.replace('&', '&') + '.*Open workspace', 'i') })).toHaveAttribute('href', `/ossa/dashboard/${path}`);
 expect(screen.queryByText('Activity review queue')).not.toBeInTheDocument();
 expect(screen.queryByText('Student information review queue')).not.toBeInTheDocument();
 expect(screen.queryByRole('region', { name: 'Sanction status chart' })).not.toBeInTheDocument();
 expect(screen.queryByLabelText('Search student sanctions')).not.toBeInTheDocument();
 expect(screen.queryByRole('link', { name: /^Sanction analytics/i })).not.toBeInTheDocument();
});
it('opens information requests independently with a link back to the hub', () => {
 renderPage('requests');
 expect(screen.getByText('Student information review queue')).toBeVisible();
 expect(screen.queryByText('Activity review queue')).not.toBeInTheDocument();
 expect(screen.getByRole('link', { name: 'OSSA Hub' })).toHaveAttribute('href', '/ossa/dashboard');
 expect(screen.queryByRole('link', { name: 'Student information requests' })).not.toBeInTheDocument();
});
it('combines sanction statistics, charts, and roster separately from excuses', () => {
 renderPage('sanctions');
 expect(screen.getByRole('heading', { name: 'Student Sanction Roster' })).toBeVisible();
 expect(screen.getByLabelText('Search student sanctions')).toBeVisible();
 expect(screen.getByLabelText('Sanction statistics')).toBeVisible();
 expect(screen.getByRole('region', { name: 'Sanction status chart' })).toBeVisible();
 expect(screen.getByRole('region', { name: 'Department sanction hours chart' })).toBeVisible();
 expect(screen.queryByText('Student Absence & Medical Excuse Queue')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Export roster CSV' })).toBeVisible();
});
it('opens the excuse queue without the sanction roster', () => {
 renderPage('excuses');
 expect(screen.getByRole('heading', { name: 'Excuse application queue' })).toBeVisible();
 expect(screen.queryByRole('heading', { name: 'Student Sanction Roster' })).not.toBeInTheDocument();
 expect(screen.queryByRole('button', { name: 'Export roster CSV' })).not.toBeInTheDocument();
});
it('shows only the workspaces allowed by the officer permissions', () => {
 state.permissions = ['events.approve']; renderPage();
 expect(screen.getByRole('link', { name: /Event & ceremony approvals.*Open workspace/i })).toBeVisible();
 expect(screen.queryByRole('link', { name: /Student information requests/i })).not.toBeInTheDocument();
 expect(screen.queryByLabelText('OSSA summary')).not.toBeInTheDocument();
});
