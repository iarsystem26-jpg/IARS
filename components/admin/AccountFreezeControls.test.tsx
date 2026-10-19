import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AccountFreezeControls from './AccountFreezeControls';
import { ThemeProvider } from '../ThemeContext';

const api = vi.hoisted(() => ({ save: vi.fn(), accounts: [
  { uid: 'owner', name: 'Admin Owner', username: 'owner', student_id: 'A', role: 'admin', account_status: 'active' },
  { uid: 'one', name: 'Student One', username: 'one', student_id: '1', role: 'student', account_status: 'pending' },
  { uid: 'two', name: 'Student Two', username: 'two', student_id: '2', role: 'student', account_status: 'active', account_freeze: { isFrozen: true, reason: 'Review', frozenAt: 123 } },
] }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: api.accounts[0], user: { email: 'owner@example.test' } }) }));
vi.mock('../../lib/supabase', () => ({ configurationError: 'Demo', supabase: {}, verifyPassword: vi.fn() }));
vi.mock('../../lib/backend', () => ({ refreshData: vi.fn(), appData: {
  getAccountsForFreeze: () => api.accounts, setAccountFreezeStatuses: api.save, isUserScopeFrozen: () => false,
} }));
beforeEach(() => { api.save.mockReset(); api.save.mockResolvedValue({}); });
afterEach(cleanup);
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<ThemeProvider><AccountFreezeControls /></ThemeProvider>);
  const trigger = screen.getByRole('button', { name: 'Individual account freezes' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await user.click(trigger);
};

it('freezes a single pending account with the entered reason', async () => {
  const user = userEvent.setup(); await open(user);
  await user.click(screen.getByRole('button', { name: 'Freeze Student One' }));
  const reason = screen.getByRole('textbox', { name: 'Reason' });
  await user.clear(reason); await user.type(reason, 'Individual review');
  await user.click(screen.getByRole('button', { name: 'Confirm freeze' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(['one'], true, 'Individual review'));
  expect(await screen.findByRole('status')).toHaveTextContent('1 account frozen successfully');
});

it('unfreezes only the selected batch, retaining selection across searches', async () => {
  const user = userEvent.setup(); await open(user);
  await user.click(screen.getByRole('checkbox', { name: 'Select Student One' }));
  await user.type(screen.getByRole('searchbox'), 'Student Two');
  await user.click(screen.getByRole('checkbox', { name: 'Select Student Two' }));
  await user.click(screen.getByRole('button', { name: 'Unfreeze selected' }));
  await user.click(screen.getByRole('button', { name: 'Confirm unfreeze' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(['one', 'two'], false, ''));
});

it('allows selecting admins and displays the server recovery restriction', async () => {
  api.save.mockRejectedValue(new Error('Keep at least one active admin unfrozen to restore access.'));
  const user = userEvent.setup(); await open(user);
  await user.click(screen.getByRole('button', { name: 'Freeze Admin Owner' }));
  expect(screen.getByText(/You selected your own account/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Confirm freeze' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Keep at least one active admin unfrozen');
});
