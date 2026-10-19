import { afterEach, expect, it } from 'vitest';
import { setMockDataRef } from './accessControl';
import { AppEvent, SchoolNode, UserProfile } from '../types';
import { canManageEventInScope, eventRecipientRoots, isEventRecipient, isCeremonyVolunteer, recipientGroupLabel, recipientRoleOptions } from './eventAudience';

afterEach(() => setMockDataRef(null));

it('includes every configured role except admin and labels custom roles', () => {
  setMockDataRef({ getCustomRoles: () => ({ adviser: { id: 'adviser', name: 'Faculty Advisers' } }) });
  expect(recipientRoleOptions().map(option => option.value)).toEqual(expect.arrayContaining([
    'All Students', 'All SSG Officers', 'All Mayors', 'role:ossa', 'role:ossa_staff', 'role:adviser',
  ]));
  expect(recipientRoleOptions().some(option => option.value === 'role:admin')).toBe(false);
  expect(recipientGroupLabel('role:adviser', [])).toBe('All Faculty Advisers');
});

it.each(['ossa', 'ossa_staff'])('matches only the selected %s role within scope', role => {
  const event = { scopeNodeId: 'a', audienceTarget: { mode: 'group_list', groups: [`role:${role}`] } } as AppEvent;
  const profile = { role, school_data: {}, official_data: { assignment_node_id: 'a1' } } as UserProfile;
  expect(isEventRecipient(event, profile, roots)).toBe(true);
  expect(isEventRecipient(event, { ...profile, role: 'student' }, roots)).toBe(false);
  expect(isEventRecipient(event, { ...profile, official_data: { body: 'OSSA', assignment_node_id: 'b1' } }, roots)).toBe(false);
  expect(isEventRecipient({ ...event, approvalStatus: 'pending' }, profile, roots)).toBe(false);
});

it('matches custom positions without including admins or unknown roles', () => {
  setMockDataRef({ getCustomRoles: () => ({ adviser: { id: 'adviser', name: 'Faculty Advisers' } }) });
  const event = { audienceTarget: { mode: 'group_list', groups: ['role:adviser'] } } as AppEvent;
  const profile = { role: 'student', positionRoleIds: ['adviser'], school_data: {} } as UserProfile;
  expect(isEventRecipient(event, profile, roots)).toBe(true);
  expect(isEventRecipient(event, { ...profile, positionRoleIds: [] }, roots)).toBe(false);
  expect(isEventRecipient(event, { ...profile, role: 'admin' }, roots)).toBe(false);
  expect(isEventRecipient({ audienceTarget: { mode: 'group_list', groups: ['role:admin'] } } as AppEvent, { ...profile, role: 'admin' }, roots)).toBe(false);
  expect(isEventRecipient({ audienceTarget: { mode: 'group_list', groups: ['role:unknown'] } } as AppEvent, { ...profile, role: 'unknown' }, roots)).toBe(false);
});

const roots: SchoolNode[] = [
  { id: 'a', name: 'General A', type: 'education_unit', children: [{ id: 'a1', name: 'Section 1', type: 'section' }, { id: 'a2', name: 'Section 2', type: 'section' }] },
  { id: 'b', name: 'General B', type: 'education_unit', children: [{ id: 'b1', name: 'Section 1', type: 'section' }, { id: 'b2', name: 'Section 2', type: 'section' }] },
];
it('requires approved organization membership and approved event rules', () => {
  const profile = { uid: 'student', role: 'student', organizationIds: ['club'], school_data: {} } as UserProfile;
  const event = { organizationId: 'club', approvalStatus: 'pending', target: { all: true } } as AppEvent;
  expect(isEventRecipient(event, profile, roots)).toBe(false);
  expect(isEventRecipient({ ...event, approvalStatus: 'approved' }, profile, roots)).toBe(true);
  expect(isEventRecipient({ ...event, approvalStatus: 'approved' }, { ...profile, organizationIds: [] }, roots)).toBe(false);
  expect(isEventRecipient({ ...event, approvalStatus: 'rejected' }, profile, roots)).toBe(false);
});
it('exempts selected students and allows optional attendance independently of merit', () => {
  const profile = { uid: 'student-a', role: 'student', school_data: { academic_assignment: { terminalGroupId: 'a1' } } } as UserProfile;
  const event = { kind: 'flag_ceremony', scopeNodeId: 'a', audienceTarget: { mode: 'directory_node', nodeId: 'a2' }, ceremony: { exemptStudentIds: [], allowVolunteerMerit: false, volunteerMeritHours: 1, classWindows: {} } } as AppEvent;
  expect(isEventRecipient(event, profile, roots)).toBe(false);
  expect(isCeremonyVolunteer(event, profile, roots)).toBe(true);
  expect(isCeremonyVolunteer({ ...event, scopeNodeId: 'b' }, profile, roots)).toBe(false);
  event.ceremony!.exemptStudentIds = [profile.uid];
  expect(isCeremonyVolunteer(event, profile, roots)).toBe(false);
  expect(isEventRecipient({ ...event, audienceTarget: { mode: 'all' } }, profile, roots)).toBe(false);
});
it.each(['ossa', 'ossa_staff', 'ssg'])('limits %s recipient choices to the assigned subtree', role => {
  const profile = { role, official_data: { assignment_node_id: 'a' } } as UserProfile;
  expect(eventRecipientRoots(profile, roots).map(node => node.id)).toEqual(['a']);
  expect(eventRecipientRoots({ ...profile, official_data: { assignment_node_id: 'a1' } } as UserProfile, roots).map(node => node.id)).toEqual(['a1']);
  expect(eventRecipientRoots({ role } as UserProfile, roots)).toEqual([]);
});
it('keeps system administrator choices unrestricted', () => {
  expect(eventRecipientRoots({ role: 'admin' } as UserProfile, roots)).toEqual(roots);
});
it('does not let event creators manage an old unit after reassignment', () => {
  const profile = { uid: 'officer', role: 'ssg', official_data: { assignment_node_id: 'a1' } } as UserProfile;
  expect(canManageEventInScope(profile, { created_by: 'officer', scopeNodeId: 'b' } as AppEvent, roots)).toBe(false);
  expect(canManageEventInScope(profile, { scopeNodeId: 'a' } as AppEvent, roots)).toBe(false);
  expect(canManageEventInScope(profile, { scopeNodeId: 'a1' } as AppEvent, roots)).toBe(true);
});
it('matches descendants of a general recipient and the union of multiple recipients by ID', () => {
  const event = { audienceTarget: { mode: 'group_list', groups: ['node:a', 'node:b1'] } } as AppEvent;
  for (const [id, expected] of [['a1', true], ['a2', true], ['b1', true], ['b2', false]] as const) {
    const profile = { school_data: { academic_assignment: { terminalGroupId: id } } } as UserProfile;
    expect(isEventRecipient(event, profile, roots)).toBe(expected);
  }
  expect(recipientGroupLabel('node:b1', roots)).toBe('General B / Section 1');
});
it('resolves an officer assignment even when a cached path is absent', () => {
  const event = { audienceTarget: { mode: 'group_list', groups: ['node:a'] } } as AppEvent;
  const profile = { school_data: {}, official_data: { assignment_node_id: 'a1' } } as UserProfile;
  expect(isEventRecipient(event, profile, roots)).toBe(true);
});
