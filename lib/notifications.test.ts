import { expect, it, vi } from 'vitest';
import { loadNotifications } from './notifications';

const mocks = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({
      order: () => ({ order: () => ({ range: mocks.range }) }),
    }) }) }),
  },
}));

it('repairs corrupted em dashes in stored notices while preserving valid text and metadata', async () => {
  const row = {
    id: 'notice-1', user_id: 'student-1',
    title: 'Information edit: approved',
    detail: 'Full name \u00e2\u20ac\u201d approved. Jos\u00e9 \u2014 updated.',
    path: '/student/profile', created_at: '2026-10-09T04:24:54Z', read_at: null,
  };
  mocks.range.mockResolvedValue({ data: [row, { ...row, id: 'notice-2', title: 'Review \u00e2\u20ac\u201d approved' }], error: null });

  const rows = await loadNotifications('student-1');

  expect(rows[0]).toEqual({ ...row, detail: 'Full name \u2014 approved. Jos\u00e9 \u2014 updated.' });
  expect(rows[1].title).toBe('Review \u2014 approved');
  expect(row.detail).toContain('\u00e2\u20ac\u201d');
});
