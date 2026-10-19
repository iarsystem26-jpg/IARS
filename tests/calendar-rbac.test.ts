import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_CORE_ROLES, hasPermission } from '../lib/accessControl';
describe('Calendar RBAC', () => {
 it('gives every built-in role calendar access and keeps suspension management opt-in', () => {
  for (const role of Object.keys(DEFAULT_CORE_ROLES)) {
   expect(hasPermission(role, 'calendar.view', {}, DEFAULT_CORE_ROLES)).toBe(true);
   expect(hasPermission(role, 'calendar.manage_closures', {}, DEFAULT_CORE_ROLES)).toBe(role === 'admin');
  }
 });
 it('honors grants and revocations for any custom role', () => {
  const roles = { delegate: { id: 'delegate', name: 'Calendar delegate', description: '', createdBy: 'admin', createdAt: 0, isPositionOnly: false, permissions: ['calendar.view', 'calendar.manage_closures'] as const } };
  expect(hasPermission('delegate', 'calendar.manage_closures', roles as any, {})).toBe(true);
  expect(hasPermission('delegate', 'calendar.manage_schoolwide', roles as any, {})).toBe(false);
  expect(hasPermission('delegate', 'calendar.manage_closures', { delegate: { ...roles.delegate, permissions: [] } }, {})).toBe(false);
  expect(hasPermission('delegate', 'calendar.view', { delegate: { ...roles.delegate, permissions: ['calendar.view'], isPositionOnly: true } }, {})).toBe(false);
 });
 it('does not let admin bypass a disabled calendar permission', () => {
  expect(hasPermission('admin', 'calendar.view', {}, { admin: { ...DEFAULT_CORE_ROLES.admin, permissions: [] } })).toBe(false);
 });
 it('exposes independent calendar toggles to the shared role editor', () => {
  expect(ALL_PERMISSIONS.filter(item => item.id.startsWith('calendar.')).map(item => item.id)).toEqual(['calendar.view', 'calendar.manage_schedules', 'calendar.view_scope', 'calendar.manage_closures', 'calendar.manage_schoolwide']);
 });
 it('allows admin, OSSA and SSG to manage informational schedules by default', () => {
  for (const role of Object.keys(DEFAULT_CORE_ROLES)) expect(hasPermission(role, 'calendar.manage_schedules', {}, DEFAULT_CORE_ROLES)).toBe(['admin', 'ossa', 'ssg'].includes(role));
 });
});
