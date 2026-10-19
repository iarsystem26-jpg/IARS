import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FrozenAccess from './FrozenAccess';
import { ThemeProvider } from '../ThemeContext';

const api = vi.hoisted(() => ({ refresh: vi.fn(), signOut: vi.fn(), error: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'student', name: 'Maria Santos' } }) }));
vi.mock('../../lib/backend', () => ({ appAuth: { signOut: api.signOut }, refreshData: api.refresh }));
vi.mock('../../lib/freeze', () => ({ getFreezeDetails: () => ({ global: false, scope: 'Education Department', reason: 'Scheduled maintenance', frozenAt: 1791504000000 }) }));
vi.mock('../../lib/toast', () => ({ toast: { error: api.error } }));
beforeEach(() => { vi.resetAllMocks(); api.refresh.mockResolvedValue(true); api.signOut.mockResolvedValue(undefined); });
afterEach(cleanup);
const open = () => render(<ThemeProvider><FrozenAccess /></ThemeProvider>);

it('shows the app identity and account name with public legal document buttons', () => {
  open();
  expect(screen.getByRole('img', { name: 'IARS logo' })).toBeVisible();
  expect(screen.getByText('IARS', { exact: true })).toBeVisible();
  expect(screen.getAllByText('Institution Attendance & Records System')[0]).toBeVisible();
  expect(screen.getByText('Maria Santos')).toBeVisible();
  for (const [title, path] of [['Privacy Policy', '/privacy-policy'], ['Data Deletion', '/data-deletion'], ['Data Privacy Act Agreement', '/data-privacy-agreement'], ['Terms of Service', '/terms-of-service']]) {
    const link = screen.getByRole('link', { name: title });
    expect(link).toHaveAttribute('href', `#${path}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

it('checks access and tells the user when the pause remains active', async () => {
  const user = userEvent.setup(); open();
  await user.click(screen.getByRole('button', { name: 'Check access again' }));
  expect(api.refresh).toHaveBeenCalledOnce();
  expect(await screen.findByRole('status')).toHaveTextContent('Access is still paused.');
  expect(screen.getByRole('button', { name: 'Check access again' })).toBeEnabled();
});

it('keeps the frozen screen visible when a refresh fails', async () => {
  const user = userEvent.setup();
  const error = new Error('Network unavailable'); api.refresh.mockRejectedValue(error); open();
  await user.click(screen.getByRole('button', { name: 'Check access again' }));
  await waitFor(() => expect(api.error).toHaveBeenCalledWith(error));
  expect(screen.getByRole('heading', { name: 'Your workspace is paused' })).toBeVisible();
  expect(screen.getByRole('status')).not.toHaveTextContent('Access is still paused.');
});

it('lets the user sign out without requiring workspace access', async () => {
  const user = userEvent.setup(); open();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(api.signOut).toHaveBeenCalledOnce();
  expect(api.refresh).not.toHaveBeenCalled();
});
