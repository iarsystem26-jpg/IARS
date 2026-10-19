import { beforeEach, expect, it, vi } from 'vitest';
import { claimApprovalNotice } from './approvalNotice';

const api = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: api } }));
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); api.getUser.mockResolvedValue({ data: { user: { id: 'student', user_metadata: {} } }, error: null }); api.updateUser.mockResolvedValue({ error: null }); });

it('records a timestamp only on the first view', async () => {
  expect(await claimApprovalNotice('student')).toBe(true);
  const timestamp = api.updateUser.mock.calls[0][0].data.approval_notice_seen_at;
  expect(Number.isFinite(Date.parse(timestamp))).toBe(true);
  api.getUser.mockResolvedValue({ data: { user: { id: 'student', user_metadata: { approval_notice_seen_at: timestamp } } }, error: null });
  expect(await claimApprovalNotice('student')).toBe(false);
  expect(api.updateUser).toHaveBeenCalledOnce();
});
it('migrates the old browser preference into the backend without showing approval again', async () => {
  localStorage.setItem('rmc:dashboard-opened:student', 'true');
  expect(await claimApprovalNotice('student')).toBe(false);
  expect(api.updateUser).toHaveBeenCalledOnce();
});
it('shares concurrent mount requests and does not swallow save failures', async () => {
  api.updateUser.mockResolvedValue({ error: new Error('Save failed') });
  const first = claimApprovalNotice('student');
  expect(claimApprovalNotice('student')).toBe(first);
  await expect(first).rejects.toThrow('Save failed');
  expect(api.updateUser).toHaveBeenCalledOnce();
});
it('does not write a notice for a different signed-in account', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'other', user_metadata: {} } }, error: null });
  await expect(claimApprovalNotice('student')).rejects.toThrow('Please sign in again');
  expect(api.updateUser).not.toHaveBeenCalled();
});
