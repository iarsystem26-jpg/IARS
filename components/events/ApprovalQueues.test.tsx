import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ActivityApprovalQueue from './ActivityApprovalQueue';
import OrganizationApprovalQueue from './OrganizationApprovalQueue';
import ExcuseApprovalQueue from './ExcuseApprovalQueue';
import { AppEvent, ExcuseApplication } from '../../types';

const state = vi.hoisted(() => ({ events: [] as any[], organizations: [] as any[], sanctions: [] as any[], scope: true, role: 'ossa', reviewEvent: vi.fn(), organizationCommand: vi.fn(), reviewExcuse: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'officer', role: state.role } }) }));
vi.mock('../../lib/accessControl', () => ({ hasPermission: () => true }));
vi.mock('../../lib/eventAudience', () => ({ canManageEventInScope: () => state.scope, recipientGroupLabel: (group: string) => group === 'node:class-a' ? 'College / Class A' : group }));
vi.mock('../../lib/backend', () => ({ documentUrl: vi.fn(), appData: { getUserDetail: (uid: string) => uid === 'author' ? { profile: { uid, name: 'Alex Reyes', role: 'ssg', student_id: 'S002' } } : null, getVisibleEvents: () => state.events, getEvents: () => state.events, getOrganizations: () => state.organizations, getOrganizationSanctions: () => state.sanctions, getSchoolStructure: () => [], reviewEvent: (...args: unknown[]) => state.reviewEvent(...args), organizationCommand: (...args: unknown[]) => state.organizationCommand(...args), reviewExcuseApplication: (...args: unknown[]) => state.reviewExcuse(...args) } }));
const event = (id = 'event'): AppEvent => ({ id, title: `Activity ${id}`, description: 'Full event details', requiresOssaApproval: true, created_by: 'author', kind: 'attendance', status: 'upcoming', approvalStatus: 'pending', startTime: Date.now() + 86400000, endTime: Date.now() + 90000000, penaltyValue: 2, penaltyUnit: 'hours', location: { lat: 0, lng: 0, radius_meters: 100 } } as AppEvent);
const excuse: ExcuseApplication = { id: 'excuse', student_uid: 'student', student_name: 'Test Student', student_id: 'S001', department: 'College', section: 'A', event_title: 'Assembly', category: 'medical', reason: 'Medical appointment details', submission_date: Date.now(), status: 'pending' };
const mount = (element: React.ReactNode) => render(<MemoryRouter>{element}</MemoryRouter>);
beforeEach(() => { state.events = []; state.organizations = []; state.sanctions = []; state.scope = true; state.role = 'ossa'; vi.clearAllMocks(); state.reviewEvent.mockResolvedValue(undefined); state.organizationCommand.mockResolvedValue(undefined); state.reviewExcuse.mockResolvedValue(undefined); });
afterEach(cleanup);

it('keeps activity statistics across statuses while searching the pending queue', () => {
  state.events = [event('pending'), { ...event('approved'), approvalStatus: 'approved' }, { ...event('rejected'), approvalStatus: 'rejected' }];
  mount(<ActivityApprovalQueue />);
  const statistics = within(screen.getByLabelText('Request statistics'));
  expect(statistics.getByText('Total requests').parentElement).toHaveTextContent('3');
  for (const status of ['Pending', 'Approved', 'Rejected']) expect(statistics.getByText(status).parentElement).toHaveTextContent('1');
  fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'no matching activity' } });
  expect(screen.getByText('No activity requests match your filters.')).toBeVisible();
  expect(statistics.getByText('Total requests').parentElement).toHaveTextContent('3');
});

it('paginates brief activity titles and puts schedule and decision controls in the modal', async () => {
  state.events = Array.from({ length: 12 }, (_, i) => event(String(i)));
  mount(<ActivityApprovalQueue />);
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('button')).toHaveLength(10);
  expect(screen.queryByText('Full event details')).not.toBeInTheDocument();
  expect(document.querySelector('select')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(within(table).getAllByRole('button')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Activity 10' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Full event details');
  expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(state.reviewEvent).toHaveBeenCalledWith('10', 'approved', ''));
});

it('filters status using the existing custom dropdown and resets pagination', () => {
  state.events = [event(), { ...event('approved'), approvalStatus: 'approved' }];
  mount(<ActivityApprovalQueue />);
  expect(screen.queryByRole('button', { name: 'Activity approved' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Request status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Approved' }));
  fireEvent.click(screen.getByRole('button', { name: 'Activity approved' }));
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
});

it('preserves activity scope and self-review restrictions', () => {
  state.events = [{ ...event(), created_by: 'officer' }];
  mount(<ActivityApprovalQueue />);
  fireEvent.click(screen.getByRole('button', { name: 'Activity event' }));
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
});

it('collapses event approvals without losing filters and identifies the requester', () => {
  state.events = [event()];
  mount(<ActivityApprovalQueue purpose="event" />);
  fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'Alex Reyes' } });
  expect(screen.getByText('Requested by Alex Reyes')).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: /Event approvals.*1 pending/ });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByLabelText('Search requests')).toHaveValue('Alex Reyes');
  fireEvent.click(screen.getByRole('button', { name: 'Activity event' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Requested byAlex Reyes');
  expect(dialog).toHaveTextContent('Requester roleSSG');
  expect(dialog).toHaveTextContent('Student / official IDS002');
});

it('shows ceremony class windows, exemptions, geofence and review history in logical sections', () => {
  state.events = [{ ...event(), kind: 'flag_ceremony', venue: 'School grounds', timestamp: Date.now(),
    recipientGroups: ['node:class-a'], scopeNodeId: 'class-a', excuseWindowDays: 3,
    geofenceEnabled: true, reviewNotes: 'Please verify the class schedules.', reviewedBy: 'author', reviewedAt: Date.now(),
    ceremony: { flagKind: 'retreat', useStandardSchedule: false, exemptStudentIds: ['author'], allowVolunteerMerit: true, volunteerMeritHours: 1,
      classWindows: { 'class-a': [{ id: 'afternoon', label: 'Afternoon', timeIn: '16:00', timeOut: '16:30', lateAfterMinutes: 5 }] } },
  }];
  mount(<ActivityApprovalQueue purpose="ceremony" />);
  expect(screen.getByRole('button', { name: /Ceremony approvals.*1 pending/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Activity event' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Flag retreat / lowering');
  expect(dialog).toHaveTextContent('School grounds');
  expect(dialog).toHaveTextContent('College / Class A');
  expect(dialog).toHaveTextContent('Alex Reyes (S002)');
  expect(dialog).toHaveTextContent('Late after 5 minutes');
  expect(dialog).toHaveTextContent('Closes 3 days after the activity ends');
  expect(dialog).toHaveTextContent('100 m radius');
  expect(dialog).toHaveTextContent('Please verify the class schedules.');
});

it('shows the saved account identifier when the requester profile is unavailable', () => {
  state.events = [{ ...event(), created_by: 'missing-author' }];
  mount(<ActivityApprovalQueue />);
  expect(screen.getByText('Requested by Account missing-author')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Activity event' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Profile unavailable');
});

it('reviews an organization sanction from its detail panel with the correct organization and request', async () => {
  state.organizations = [{ id: 'org', name: 'Student Society', can_review: true }];
  state.sanctions = [{ id: 'sanction', organization_id: 'org', student_id: 'student', student_name: 'Test Student', hours: 3, reason: 'Detailed sanction reason', status: 'pending', created_at: new Date().toISOString() }];
  mount(<OrganizationApprovalQueue />);
  expect(screen.queryByText('Detailed sanction reason')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sanction request — Test Student' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('3 hours');
  fireEvent.change(screen.getByLabelText('Decision notes (required for rejection)'), { target: { value: 'Insufficient evidence' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  await waitFor(() => expect(state.organizationCommand).toHaveBeenCalledWith('reviewSanction', { organizationId: 'org', requestId: 'sanction', status: 'rejected', notes: 'Insufficient evidence' }));
});

it('reviews organization events with the existing organization command', async () => {
  state.organizations = [{ id: 'org', name: 'Student Society', can_review: true }];
  state.events = [{ ...event(), organizationId: 'org' }];
  mount(<OrganizationApprovalQueue />);
  fireEvent.click(screen.getByRole('button', { name: 'Activity event — Student Society' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(state.organizationCommand).toHaveBeenCalledWith('reviewEvent', { organizationId: 'org', eventId: 'event', status: 'approved', notes: '' }));
});

it('shows errors without closing the excuse panel and validates waived hours', async () => {
  state.reviewExcuse.mockRejectedValueOnce(new Error('Unable to save decision'));
  const changed = vi.fn();
  mount(<ExcuseApprovalQueue applications={[excuse]} onChanged={changed} />);
  expect(screen.queryByText(excuse.reason)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Assembly — Test Student' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(excuse.reason);
  fireEvent.change(screen.getByLabelText('Sanction hours to waive upon approval'), { target: { value: '-1' } });
  expect(screen.getByRole('button', { name: 'Approve & waive hours' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Sanction hours to waive upon approval'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Approve & waive hours' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('SYS-001'));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Approve & waive hours' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(state.reviewExcuse).toHaveBeenLastCalledWith('excuse', 'approved', 'Approved by OSSA.', 3);
});

it('opens reviewed excuses as read-only details with the saved decision', () => {
  mount(<ExcuseApprovalQueue applications={[{ ...excuse, status: 'rejected', review_notes: 'Missing documentation' }]} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Request status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Rejected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Assembly — Test Student' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Missing documentation');
  expect(screen.queryByRole('button', { name: 'Reject excuse' })).not.toBeInTheDocument();
});
