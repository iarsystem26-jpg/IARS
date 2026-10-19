import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), list: vi.fn(), remove: vi.fn(), unavailable: vi.fn() }));
vi.mock('../lib/passkeys', () => ({ signInWithPasskey: api.login, registerPasskey: api.register, listPasskeys: api.list, removePasskey: api.remove, passkeyUnavailableReason: api.unavailable, passkeyErrorMessage: (e: Error) => e.message }));
import PasskeySignIn from './PasskeySignIn';
import PasskeySettings from './PasskeySettings';
const passkey = { id: 'key', friendly_name: 'Windows Hello', created_at: '2026-10-08T00:00:00Z' };
beforeEach(() => { vi.resetAllMocks(); api.unavailable.mockReturnValue(null); api.list.mockResolvedValue([]); });
afterEach(cleanup);
it('calls success only after login succeeds and recovers from cancelled login', async () => {
  const success = vi.fn(); api.login.mockRejectedValueOnce(new Error('Cancelled')).mockResolvedValueOnce({});
  render(<PasskeySignIn onSuccess={success} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));
  await screen.findByRole('alert'); expect(success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
});
it('prevents overlapping login and aborts the browser prompt on unmount', async () => {
  api.login.mockReturnValue(new Promise(() => {}));
  const view = render(<PasskeySignIn onSuccess={vi.fn()} />);
  const button = screen.getByRole('button'); fireEvent.click(button); fireEvent.click(button);
  expect(api.login).toHaveBeenCalledOnce();
  const signal = api.login.mock.calls[0][0] as AbortSignal; view.unmount(); expect(signal.aborted).toBe(true);
});
it('offers an explanation when passkey login is unavailable', () => {
  api.unavailable.mockReturnValue('Use the configured website domain.'); render(<PasskeySignIn onSuccess={vi.fn()} />);
  expect(screen.getByRole('button')).toBeDisabled(); expect(screen.getByText('Use the configured website domain.')).toBeInTheDocument();
});
it('registers a passkey and updates the displayed credential list', async () => {
  api.register.mockResolvedValue(passkey); api.list.mockResolvedValueOnce([]).mockResolvedValueOnce([passkey]);
  render(<PasskeySettings />); await screen.findByText('No passkeys added yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));
  await screen.findByText('Windows Hello'); expect(api.register).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Passkey added');
});
it('requires confirmation before revocation and retains the credential on a server rejection', async () => {
  api.list.mockResolvedValue([passkey]); api.remove.mockRejectedValue(new Error('Access denied'));
  render(<PasskeySettings />); await screen.findByText('Windows Hello');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Windows Hello' })); expect(api.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(api.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Windows Hello' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001'); expect(screen.getByText('Windows Hello')).toBeInTheDocument();
});
it('revokes the selected credential and refreshes the list', async () => {
  api.list.mockResolvedValueOnce([passkey]).mockResolvedValueOnce([]); api.remove.mockResolvedValue(undefined);
  render(<PasskeySettings />); await screen.findByText('Windows Hello');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Windows Hello' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await screen.findByText('No passkeys added yet.'); expect(api.remove).toHaveBeenCalledWith('key');
});
it('distinguishes an initial list failure from an empty account', async () => {
  api.list.mockRejectedValue(new Error('Network unavailable')); render(<PasskeySettings />);
  expect(await screen.findByRole('alert')).toHaveTextContent('NET-001'); expect(screen.queryByText('No passkeys added yet.')).not.toBeInTheDocument();
});
