import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ auth: {} as any, applications: [] as any[], statusVisits: vi.fn() }));
vi.mock('./components/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => state.auth }));
vi.mock('./components/ThemeContext', () => ({ ThemeProvider: ({ children }: any) => children }));
vi.mock('./components/NavigationMemory', () => ({ default: ({ children }: any) => children }));
vi.mock('./components/ui/Layout', () => ({ default: ({ children }: any) => <div data-testid="workspace-shell">{children}</div> }));
vi.mock('./components/ui/PwaStatus', () => ({ default: ({ children }: { children?: React.ReactNode }) => children }));
vi.mock('./components/ui/ToastViewport', () => ({ default: () => null }));
vi.mock('./lib/backend', () => ({ appData: { getApplications: () => state.applications } }));
vi.mock('./views/Dashboard', () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock('./views/StudentTransfers', () => ({ default: () => <h1>Transfer students</h1> }));
vi.mock('./views/OSSADashboard', () => ({ default: ({ section = 'overview' }: any) => <h1>OSSA {section}</h1> }));
vi.mock('./views/RegisterStatus', () => ({ default: () => { state.statusVisits(); return <h1>Application status</h1>; } }));
vi.mock('./views/SSGPanel', () => ({ default: () => <h1>School hierarchy</h1> }));
vi.mock('./views/ClassStudentDetail', () => ({ default: () => <h1>Student detail</h1> }));
vi.mock('./views/AdminControls', () => ({ default: () => <h1>System controls</h1> }));
vi.mock('./views/LandingPage', () => ({ default: () => {
  const location = useLocation();
  return <output role="status">{JSON.stringify(location.state)}</output>;
} }));
import { useLocation } from 'react-router-dom';
import { setMockDataRef } from './lib/accessControl';
import App from './App';

beforeEach(() => {
  window.location.hash = '#/dashboard';
  state.statusVisits.mockClear();
  state.applications = [{ id: 'student', status: 'approved' }];
  state.auth = { user: { uid: 'student' }, profile: { uid: 'student', role: 'student', account_status: 'active' }, loading: false, approvalNoticeSeen: false };
});
afterEach(() => { cleanup(); setMockDataRef(null); window.location.hash = ''; });

it('opens the dashboard directly for an active account with an unseen approval notice', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(window.location.hash).toBe('#/dashboard');
  expect(state.statusVisits).not.toHaveBeenCalled();
});

it('preserves the workspace shell across pages and mapped hierarchy routes', async () => {
  state.auth.profile.role = 'admin';
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  const shell = screen.getByTestId('workspace-shell');
  // A scrollable sidebar belongs to this node and must survive route changes.
  shell.scrollTop = 180;
  for (const [path, heading] of [
    ['/admin/hierarchy', 'School hierarchy'],
    ['/admin/hierarchy/students/student-1', 'Student detail'],
    ['/dashboard', 'Dashboard'],
  ]) {
    await act(async () => { window.location.hash = `#${path}`; });
    await screen.findByRole('heading', { name: heading });
    expect(screen.getByTestId('workspace-shell')).toBe(shell);
    expect(shell.scrollTop).toBe(180);
  }
});

it('keeps public pages outside the workspace shell', async () => {
  window.location.hash = '#/login';
  render(<App />);
  await waitFor(() => expect(document.querySelector('output')).toBeInTheDocument());
  expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();
});

it('waits for the profile during login without visiting application status', async () => {
  state.auth = { ...state.auth, loading: true, profile: null };
  const view = render(<App />);
  await screen.findByRole('status', { name: 'Loading your workspace' });
  expect(state.statusVisits).not.toHaveBeenCalled();
  state.auth = { ...state.auth, loading: false, profile: { uid: 'student', role: 'student', account_status: 'active' } };
  view.rerender(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(state.statusVisits).not.toHaveBeenCalled();
});

it('still directs applicants without an active profile to application status', async () => {
  state.auth.profile = null;
  state.applications = [{ id: 'student', status: 'pending' }];
  render(<App />);
  await screen.findByRole('heading', { name: 'Application status' });
  expect(window.location.hash).toBe('#/register/status');
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
});

it('opens the dedicated transfer route for an authorized administrator', async () => {
  state.auth.profile.role = 'admin';
  window.location.hash = '#/ssg/transfers?unit=class-a';
  render(<App />);
  await screen.findByRole('heading', { name: 'Transfer students' });
  expect(window.location.hash).toBe('#/ssg/transfers?unit=class-a');
});

it('redirects students who open the transfer route without permission', async () => {
  window.location.hash = '#/ssg/transfers';
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(window.location.hash).toBe('#/dashboard');
  expect(screen.queryByRole('heading', { name: 'Transfer students' })).not.toBeInTheDocument();
});

it.each(['activities', 'requests', 'sanctions', 'excuses', 'corrections', 'organizations'])('opens the OSSA %s subpage directly', async section => {
  state.auth.profile.role = 'ossa';
  window.location.hash = `#/ossa/dashboard/${section}`;
  render(<App />);
  await screen.findByRole('heading', { name: `OSSA ${section}` });
  expect(window.location.hash).toBe(`#/ossa/dashboard/${section}`);
});

it('redirects the legacy OSSA analytics route to sanctions', async () => {
  state.auth.profile.role = 'ossa';
  window.location.hash = '#/ossa/dashboard/analytics';
  render(<App />);
  await screen.findByRole('heading', { name: 'OSSA sanctions' });
  expect(window.location.hash).toBe('#/ossa/dashboard/sanctions');
});

it('denies a student access to the OSSA request subpage', async () => {
  window.location.hash = '#/ossa/dashboard/requests';
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(window.location.hash).toBe('#/dashboard');
});


it.each([
  ['/ssg/panel?unit=class-a&tab=hub', '/admin/hierarchy?unit=class-a&tab=hub', 'School hierarchy'],
  ['/ssg/panel/students/student-1?unit=class-a', '/admin/hierarchy/students/student-1?unit=class-a', 'Student detail'],
  ['/admin/hierarchy', '/admin/hierarchy', 'School hierarchy'],
])('opens the admin hierarchy and preserves saved context from %s', async (source, target, heading) => {
  state.auth.profile.role = 'admin';
  window.location.hash = `#${source}`;
  render(<App />);
  await screen.findByRole('heading', { name: heading });
  expect(window.location.hash).toBe(`#${target}`);
});

it('keeps an SSG officer in the SSG workspace when opening an admin hierarchy link', async () => {
  state.auth.profile.role = 'ssg';
  window.location.hash = '#/admin/hierarchy?unit=class-a';
  render(<App />);
  await screen.findByRole('heading', { name: 'School hierarchy' });
  expect(window.location.hash).toBe('#/ssg/panel?unit=class-a');
});

it('denies a student access to the admin hierarchy', async () => {
  window.location.hash = '#/admin/hierarchy';
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(window.location.hash).toBe('#/dashboard');
});

it.each(['rbac', 'accounts', 'freeze', 'payment', 'legal', 'video'])('denies copied %s tab links even when OSSA can view health', async tab => {
  state.auth.profile.role = 'ossa';
  window.location.hash = `#/admin/controls?tab=${tab}`;
  render(<App />);
  await screen.findByRole('heading', { name: 'OSSA overview' });
  expect(window.location.hash).toBe('#/ossa/dashboard');
  expect(screen.queryByRole('heading', { name: 'System controls' })).not.toBeInTheDocument();
});

it('denies system controls when saved RBAC removes all access', async () => {
  setMockDataRef({ getCoreRoles: () => ({ ossa: { permissions: ['ossa.manage_cases'] } }), getCustomRoles: () => ({}) });
  state.auth.profile.role = 'ossa';
  window.location.hash = '#/admin/controls?tab=health';
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(screen.queryByRole('heading', { name: 'System controls' })).not.toBeInTheDocument();
});

it.each(['rbac', 'health', 'accounts'])('allows authorized admin %s tab links', async tab => {
  state.auth.profile.role = 'admin';
  window.location.hash = `#/admin/controls?tab=${tab}`;
  render(<App />);
  await screen.findByRole('heading', { name: 'System controls' });
  expect(window.location.hash).toBe(`#/admin/controls?tab=${tab}`);
});

it('ties an expired session return link to the previous account', async () => {
  state.auth = { ...state.auth, user: { uid: 'admin-1' }, profile: { ...state.auth.profile, uid: 'admin-1', role: 'admin' } };
  window.location.hash = '#/admin/controls?tab=rbac';
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'System controls' });
  state.auth = { ...state.auth, user: null, profile: null };
  view.rerender(<App />);
  await waitFor(() => expect(window.location.hash).toBe('#/login'));
  expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({ returnTo: '/admin/controls?tab=rbac', returnToOwner: 'admin-1' });
});
