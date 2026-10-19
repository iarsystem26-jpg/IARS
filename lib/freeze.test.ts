import { beforeEach, expect, it, vi } from 'vitest';
import type { UserProfile } from '../types';
const api = vi.hoisted(() => ({ system: vi.fn(), path: vi.fn(), node: vi.fn() }));
vi.mock('./backend', () => ({ appData: { getSystemFreezeStatus: api.system, getSchoolNodePath: api.path, getNodeFreezeStatus: api.node } }));
import { getFreezeDetails } from './freeze';
beforeEach(() => {
  vi.resetAllMocks();
  api.system.mockReturnValue({ isFrozen: false, reason: '' });
  api.path.mockReturnValue([{ id: 'department', name: 'Education Department' }, { id: 'class', name: 'Class A' }]);
  api.node.mockImplementation(id => id === 'department' ? { isFrozen: true, reason: 'Maintenance', frozenAt: 123 } : null);
});
it('shows the frozen parent reason for a student assigned to a child class', () => {
  expect(getFreezeDetails({ school_data: { academic_assignment: { terminalGroupId: 'class' } } } as UserProfile)).toMatchObject({ scope: 'Education Department', reason: 'Maintenance', global: false });
});
it('resolves an official assignment without a student academic assignment', () => {
  expect(getFreezeDetails({ official_data: { assignment_node_id: 'department' } } as UserProfile)?.scope).toBe('Education Department');
});
it('gives the master freeze priority over a separate unit freeze', () => {
  api.system.mockReturnValue({ isFrozen: true, reason: 'School maintenance' });
  expect(getFreezeDetails(null)).toMatchObject({ scope: 'Entire school system', reason: 'School maintenance', global: true });
  expect(api.path).not.toHaveBeenCalled();
});
it('returns no freeze details when the assigned scope is active', () => {
  api.node.mockReturnValue(null);
  expect(getFreezeDetails({ official_data: { assignment_node_id: 'department' } } as UserProfile)).toBeNull();
});
it('prioritizes an individual admin freeze over school and unit freezes', () => {
  api.system.mockReturnValue({ isFrozen: true, reason: 'School pause' });
  expect(getFreezeDetails({ role: 'admin', account_freeze: { isFrozen: true, reason: 'Account review', frozenAt: 123 } } as UserProfile))
    .toMatchObject({ account: true, global: false, scope: 'Your account', reason: 'Account review' });
  expect(api.system).not.toHaveBeenCalled();
});
