import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CORE_ROLES, hasPermission, setMockDataRef } from './accessControl';
import { canAccessSystemControls } from './systemControlsAccess';

afterEach(() => setMockDataRef(null));

describe('role permission boundaries', () => {
  it('does not grant OSSA System Health access by default', () => {
    setMockDataRef(null);
    expect(hasPermission('ossa', 'system.health')).toBe(false);
    expect(canAccessSystemControls('ossa', '?tab=health')).toBe(false);
    expect(hasPermission('admin', 'system.health')).toBe(true);
    expect(canAccessSystemControls('admin', '?tab=health')).toBe(true);
  });
  it.each([
    { role: 'admin', scan: true, events: true, approve: false, sanctions: true, rbac: true },
    { role: 'ossa', scan: true, events: true, approve: true, sanctions: true, rbac: false },
    { role: 'ossa_staff', scan: true, events: false, approve: false, sanctions: true, rbac: false },
    { role: 'ssg', scan: true, events: true, approve: false, sanctions: false, rbac: false },
    { role: 'mayor', scan: true, events: false, approve: false, sanctions: false, rbac: false },
    { role: 'student', scan: false, events: false, approve: false, sanctions: false, rbac: false },
  ])('enforces the intended defaults for $role', ({ role, scan, events, approve, sanctions, rbac }) => {
    expect(hasPermission(role, 'attendance.scan', {}, {})).toBe(scan);
    expect(hasPermission(role, 'events.manage', {}, {})).toBe(events);
    expect(hasPermission(role, 'events.approve', {}, {})).toBe(approve);
    expect(hasPermission(role, 'directory.manage_student_sanctions', {}, {})).toBe(sanctions);
    expect(hasPermission(role, 'system.manage_rbac', {}, {})).toBe(rbac);
    expect(hasPermission(role, 'calendar.view', {}, {})).toBe(true);
  });
  it('does not give an admin activity-review permission when role definitions are missing', () => {
    setMockDataRef({ getCoreRoles: () => ({}), getCustomRoles: () => ({}) });
    expect(hasPermission('admin', 'events.approve')).toBe(false);
  });
  it('honors saved grants and revocations, including admin revocations', () => {
    const core = { ...DEFAULT_CORE_ROLES, admin: { ...DEFAULT_CORE_ROLES.admin, permissions: [] }, ossa_staff: { ...DEFAULT_CORE_ROLES.ossa_staff, permissions: ['events.manage' as const] } };
    expect(hasPermission('admin', 'system.manage_rbac', {}, core)).toBe(false);
    expect(hasPermission('ossa_staff', 'events.manage', {}, core)).toBe(true);
    expect(hasPermission('ossa_staff', 'attendance.scan', {}, core)).toBe(false);
  });
  it('grants custom access roles their permissions and gives positions no access', () => {
    const custom = { id: 'custom', name: 'Custom', description: 'Test access role', createdBy: 'test', createdAt: 0, isPositionOnly: false, permissions: ['attendance.scan' as const] };
    expect(hasPermission('custom', 'attendance.scan', { custom }, {})).toBe(true);
    expect(hasPermission('custom', 'attendance.scan', { custom: { ...custom, isPositionOnly: true } }, {})).toBe(false);
    expect(hasPermission('unknown', 'attendance.scan', {}, {})).toBe(false);
  });
});
