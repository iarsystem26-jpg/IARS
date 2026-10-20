import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SensitiveActionModal } from './SensitiveActionModal';

const security = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ sensitiveActionRequiresMfa: security }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each([true, false])('requires an authenticator code only when enrolled (%s)', async enrolled => {
  security.mockResolvedValue(enrolled);
  const confirm = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<SensitiveActionModal action="DELETE" targetName="Unused Unit" onClose={() => {}} onConfirm={confirm} />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  await user.type(screen.getByLabelText('Current password'), 'current-password');
  const password = screen.getByLabelText('Current password');
  expect(password).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Show current password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('current-password');
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Hide current password' }));
  expect(password).toHaveAttribute('type', 'password');
  await user.type(screen.getByLabelText('Type DELETE'), 'DELETE');
  await user.type(screen.getByLabelText('Type the exact name: Unused Unit'), 'Unused Unit');
  await user.type(screen.getByLabelText('Reason'), 'Duplicate unit');
  const submit = screen.getByRole('button', { name: 'Confirm Delete' });
  if (enrolled) {
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Google Authenticator code'), '123456');
  } else {
    expect(screen.queryByLabelText('Google Authenticator code')).not.toBeInTheDocument();
  }
  expect(submit).toBeEnabled();
  await user.click(submit);
  expect(confirm).toHaveBeenCalledWith({ password: 'current-password', code: enrolled ? '123456' : '', typedAction: 'DELETE', typedName: 'Unused Unit', reason: 'Duplicate unit' });
});

it('keeps confirmation disabled when the security check fails', async () => {
  security.mockRejectedValue(new Error('Unable to check account security'));
  render(<SensitiveActionModal action="DELETE" targetName="Unit" onClose={() => {}} onConfirm={vi.fn()} />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeDisabled();
});
