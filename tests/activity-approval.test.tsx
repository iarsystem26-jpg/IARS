import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityApprovalQueue from '../components/events/ActivityApprovalQueue';
import { DEFAULT_CORE_ROLES, hasPermission } from '../lib/accessControl';
import { isCeremonyVolunteer, isEventRecipient } from '../lib/eventAudience';
import { AppEvent, UserProfile } from '../types';

const state = vi.hoisted(() => ({ role: 'ssg', events: [] as AppEvent[], review: vi.fn() }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: state.role, role: state.role, official_data: { assignment_node_id: 'school' }, school_data: {} }, revision: 1 }) }));
vi.mock('../lib/backend', () => ({ appData: { getUserDetail: () => null, getOrganizations: () => [], getEvents: () => state.events, getVisibleEvents: () => state.events, getSchoolStructure: () => [{ id: 'school', name: 'School', type: 'school' }], reviewEvent: state.review } }));
const event = (): AppEvent => ({ id: 'event', title: 'SSG Assembly', kind: 'attendance', created_by: 'ssg', scopeNodeId: 'school', requiresOssaApproval: true, approvalStatus: 'pending', status: 'pending', startTime: Date.now() + 86400000, endTime: Date.now() + 90000000, participantsType: 'all', target: { all: true }, penaltyValue: 1, penaltyUnit: 'hours', location: { lat: 0, lng: 0, radius_meters: 0 }, timestamp: Date.now() });
const show = () => render(<MemoryRouter><ActivityApprovalQueue /></MemoryRouter>);
afterEach(cleanup);

describe('Activity approval workflow', () => {
  beforeEach(() => { state.role = 'ssg'; state.events = [event()]; state.review.mockReset().mockResolvedValue(true); });
  it('defaults SSG to no unit creation and mandatory approval, with editable RBAC rules', () => {
    expect(hasPermission('ssg', 'directory.create_units', {}, DEFAULT_CORE_ROLES)).toBe(false);
    expect(hasPermission('ssg', 'events.require_ossa_approval', {}, DEFAULT_CORE_ROLES)).toBe(true);
    expect(hasPermission('ossa', 'events.approve', {}, DEFAULT_CORE_ROLES)).toBe(true);
    const changed = { ...DEFAULT_CORE_ROLES, ssg: { ...DEFAULT_CORE_ROLES.ssg, permissions: ['directory.create_units'] as const } };
    expect(hasPermission('ssg', 'directory.create_units', {}, { ...changed, ssg: { ...changed.ssg, permissions: [...changed.ssg.permissions] } })).toBe(true);
  });
  it.each(['pending', 'rejected'] as const)('blocks %s attendance and ceremony volunteering', approvalStatus => {
    const activity = { ...event(), approvalStatus, kind: 'flag_ceremony' as const };
    const person = { uid: 'student', role: 'student', school_data: {} } as UserProfile;
    expect(isEventRecipient(activity, person, [])).toBe(false);
    expect(isCeremonyVolunteer(activity, person, [])).toBe(false);
  });
  it('shows SSG progress without approval controls', () => {
    show();
    expect(screen.getByRole('button', { name: /1 pending/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SSG Assembly' }));
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
  it('lets OSSA review and requires a rejection reason', async () => {
    state.role = 'ossa'; show();
    fireEvent.click(screen.getByRole('button', { name: 'SSG Assembly' }));
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Decision notes (required for rejection)'), { target: { value: 'Change venue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(state.review).toHaveBeenCalledWith('event', 'rejected', 'Change venue'));
  });
  it('prevents OSSA from approving its own submission', () => {
    state.role = 'ossa'; state.events[0].created_by = 'ossa'; show();
    fireEvent.click(screen.getByRole('button', { name: 'SSG Assembly' }));
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
  it('shows review errors and keeps the request open', async () => {
    state.role = 'ossa'; state.review.mockRejectedValue(new Error('This request is no longer pending.')); show();
    fireEvent.click(screen.getByRole('button', { name: 'SSG Assembly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This request is no longer pending.');
  });
});
