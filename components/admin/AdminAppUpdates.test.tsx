import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminAppUpdates from './AdminAppUpdates';

const api = vi.hoisted(() => ({ role: 'admin', factors: vi.fn(), initiate: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { role: api.role } }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { mfa: { listFactors: api.factors } } }, initiateAppRefresh: api.initiate }));
beforeEach(() => {
  vi.resetAllMocks(); api.role = 'admin';
  api.factors.mockResolvedValue({ data: { all: [] } }); api.initiate.mockResolvedValue('revision');
});
afterEach(cleanup);
it.each(['student', 'ossa', 'ossa_staff', 'ssg', 'custom-admin'])('hides the entire action from %s', role => {
  api.role = role; const { container } = render(<AdminAppUpdates />); expect(container).toBeEmptyDOMElement();
});
it('requires the password and exact confirmation before submitting', async () => {
  render(<AdminAppUpdates />); fireEvent.click(screen.getByText('Refresh everyone now'));
  const submit = await screen.findByRole('button', { name: 'Initiate refresh' }); expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Current admin password'), { target: { value: 'password' } });
  fireEvent.change(screen.getByLabelText('Type initiate to confirm'), { target: { value: 'INITIATE' } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Type initiate to confirm'), { target: { value: 'initiate' } });
  await waitFor(() => expect(submit).toBeEnabled()); fireEvent.click(submit);
  await waitFor(() => expect(api.initiate).toHaveBeenCalledWith('password', '', 'initiate'));
  expect(await screen.findByText('Refresh initiated for all clients.')).toBeInTheDocument();
});
it('requires an authenticator code when MFA is enrolled and clears secrets on cancel', async () => {
  api.factors.mockResolvedValue({ data: { all: [{ status: 'verified' }] } });
  render(<AdminAppUpdates />); fireEvent.click(screen.getByText('Refresh everyone now'));
  const code = await screen.findByLabelText('Authenticator code');
  fireEvent.change(screen.getByLabelText('Current admin password'), { target: { value: 'password' } });
  fireEvent.change(screen.getByLabelText('Type initiate to confirm'), { target: { value: 'initiate' } });
  expect(screen.getByRole('button', { name: 'Initiate refresh' })).toBeDisabled();
  fireEvent.change(code, { target: { value: '123456' } });
  expect(screen.getByRole('button', { name: 'Initiate refresh' })).toBeEnabled();
  fireEvent.click(screen.getByText('Cancel')); fireEvent.click(screen.getByText('Refresh everyone now'));
  expect(screen.getByLabelText('Current admin password')).toHaveValue('');
  expect(screen.getByLabelText('Type initiate to confirm')).toHaveValue('');
  expect(api.initiate).not.toHaveBeenCalled();
});
it('keeps the action disabled if MFA lookup fails', async () => {
  api.factors.mockResolvedValue({ error: new Error('Unavailable') });
  render(<AdminAppUpdates />); fireEvent.click(screen.getByText('Refresh everyone now'));
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Initiate refresh' })).toBeDisabled();
  expect(api.initiate).not.toHaveBeenCalled();
});
