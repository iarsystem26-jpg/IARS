import { beforeEach, expect, it } from 'vitest';
import { signInDestination, writeMemory } from './navigationMemory';

beforeEach(() => sessionStorage.clear());

it('opens OSSA Hub when a different account signs in after admin expires', () => {
  expect(signInDestination('ossa-1', 'ossa', { returnTo: '/admin/controls?tab=rbac', returnToOwner: 'admin-1' })).toBe('/ossa/dashboard');
});

it('returns the same account to its interrupted page', () => {
  expect(signInDestination('admin-1', 'admin', { returnTo: '/admin/controls?tab=rbac', returnToOwner: 'admin-1' })).toBe('/admin/controls?tab=rbac');
});

it('keeps unauthenticated deep links and account-specific history working', () => {
  expect(signInDestination('student-1', 'student', { returnTo: '/organizations/org-1' })).toBe('/organizations/org-1');
  writeMemory('student-1:history', ['/student/records']);
  expect(signInDestination('student-1', 'student', null)).toBe('/student/records');
  expect(signInDestination('student-2', 'student', { returnTo: '//example.com' })).toBe('/dashboard');
});
