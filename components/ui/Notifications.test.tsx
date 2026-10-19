import { cleanup, render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { Notifications } from './Notifications';

const state = vi.hoisted(() => ({ uid: 'student-1', rows: [] as any[], refresh: null as null | (() => void), fail: false }));
const mocks = vi.hoisted(() => ({ popup: vi.fn(), error: vi.fn(), read: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { uid: state.uid, role: 'student' } }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: mocks.popup, error: mocks.error } }));
vi.mock('../../lib/notifications', () => ({
  loadNotifications: vi.fn(async () => state.rows.map(row => ({ ...row }))),
  readNotifications: async (uid: string, ids: string[]) => {
    mocks.read(uid, ids);
    if (state.fail) throw new Error('offline');
    state.rows = state.rows.map(row => ids.includes(row.id) ? { ...row, read_at: new Date().toISOString() } : row);
  },
  subscribeNotifications: (_uid: string, refresh: () => void) => { state.refresh = refresh; return () => { state.refresh = null; }; },
}));
afterEach(() => { cleanup(); state.uid = 'student-1'; state.rows = []; state.fail = false; vi.clearAllMocks(); });
function Location() { return <p data-testid="location">{useLocation().pathname}</p>; }
function mount() { return render(<MemoryRouter><Notifications /><Location /></MemoryRouter>); }
const notice = (id: string, title: string, time = Date.now() - 10000) => ({ id, user_id: state.uid, title, detail: 'Test update', created_at: new Date(time).toISOString(), read_at: null, path: '/student/events' });

it.each([0, 1])('opens and closes notifications from trigger %i', async index => {
  const user = userEvent.setup(); mount();
  const trigger = screen.getAllByRole('button', { name: 'Notifications' })[index];
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  expect(await screen.findByText(/No notifications yet/)).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'closing');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
it('searches, reads one on navigation, and reads the entire inbox even while filtered', async () => {
  state.rows = [notice('1', 'Scheduled: Assembly'), notice('2', 'Excuse letter: approved'), notice('3', 'Welcome')];
  const user = userEvent.setup(); const view = mount();
  await waitFor(() => expect(screen.getAllByLabelText('3 unread notifications')).toHaveLength(2));
  await user.click(screen.getAllByRole('button', { name: 'Notifications' })[0]);
  await user.type(screen.getByRole('searchbox'), 'excuse');
  expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Excuse letter: approved/ }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/student/events'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await user.click((await screen.findAllByRole('button', { name: 'Notifications' }))[1]);
  expect(within(screen.getByRole('dialog')).getByText(/· Read$/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Read all' }));
  expect(mocks.read).toHaveBeenLastCalledWith('student-1', ['1', '3']);
  await waitFor(() => expect(screen.queryByLabelText('2 unread notifications')).not.toBeInTheDocument());
  view.unmount(); mount();
  await waitFor(() => expect(screen.queryByLabelText('3 unread notifications')).not.toBeInTheDocument());
});
it('shows a popup once for a new realtime notice and skips existing history', async () => {
  state.rows = [notice('old', 'Welcome')]; mount();
  await waitFor(() => expect(screen.getAllByLabelText('1 unread notifications')).toHaveLength(2));
  expect(mocks.popup).not.toHaveBeenCalled();
  state.rows.unshift(notice('new', 'Starting now', Date.now() + 100));
  await act(async () => { state.refresh?.(); });
  expect(mocks.popup).toHaveBeenCalledOnce();
  expect(screen.getAllByLabelText('2 unread notifications')).toHaveLength(2);
  await act(async () => { state.refresh?.(); });
  expect(mocks.popup).toHaveBeenCalledOnce();
});
it('keeps a notification unread when saving fails', async () => {
  state.rows = [notice('1', 'Welcome')]; state.fail = true;
  const user = userEvent.setup(); mount();
  await waitFor(() => expect(screen.getAllByLabelText('1 unread notifications')).toHaveLength(2));
  await user.click(screen.getAllByRole('button', { name: 'Notifications' })[0]);
  await user.click(screen.getByRole('button', { name: 'Read all' }));
  expect(mocks.error).toHaveBeenCalledOnce();
  expect(screen.getAllByLabelText('1 unread notifications')).toHaveLength(2);
});
it('isolates inbox state when switching accounts', async () => {
  state.rows = [notice('1', 'Private notice')]; const view = mount();
  await waitFor(() => expect(screen.getAllByLabelText('1 unread notifications')).toHaveLength(2));
  state.uid = 'student-2'; state.rows = [];
  view.rerender(<MemoryRouter><Notifications /></MemoryRouter>);
  expect(screen.queryByLabelText('1 unread notifications')).not.toBeInTheDocument();
});
