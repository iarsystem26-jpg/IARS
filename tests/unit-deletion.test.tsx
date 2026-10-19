import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import SSGPanel from '../views/SSGPanel';
import { ensureMockReferenceData } from './fixtures/demoBackend';

const sensitiveAction = vi.hoisted(() => vi.fn());
let currentRole = 'admin';

vi.mock('../components/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      uid: 'mock_uid_admin',
      name: 'Admin User',
      email: 'admin@rmc.edu.ph',
      username: 'admin',
      role: currentRole,
      account_status: 'active',
      school_data: { school_id: 'school_rmc' },
    },
    user: { uid: 'mock_uid_admin', email: 'admin@rmc.edu.ph' },
    loading: false,
    isMock: true,
  }),
}));

afterEach(cleanup);

vi.mock('../lib/backend', async () => { const m = await import('./fixtures/demoBackend'); return { appData: { ...m.mockData, performSensitiveAction: sensitiveAction }, appAuth: m.mockAuth, documentUrl: async (p: string) => p }; });

describe('Unit Deletion & Security Confirmation', () => {
  it('hides unit creation and directory templates from SSG', () => {
    localStorage.clear();
    ensureMockReferenceData();
    currentRole = 'ssg';
    render(<MemoryRouter><SSGPanel /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add template/i })).not.toBeInTheDocument();
  });
  it('hides delete unit buttons for roles without directory.delete_structure permission', () => {
    ensureMockReferenceData();
    currentRole = 'student';
    render(<MemoryRouter><SSGPanel /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /delete unit/i })).toBeNull();
  });

  it('requires password, MFA, exact name, action and reason before deleting a unit, and preserves backend errors for retry', async () => {
    localStorage.clear(); sessionStorage.clear();
    ensureMockReferenceData();
    currentRole = 'admin';
    sensitiveAction.mockReset().mockRejectedValueOnce(new Error('Incorrect password')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><SSGPanel /></MemoryRouter>);
    const deleteButton = screen.getAllByRole('button', { name: /delete unit/i })[0];
    const targetName = deleteButton.getAttribute('title')!.replace(/^Delete /, '');
    await user.click(deleteButton);
    const dialog = screen.getByRole('dialog', { name: 'Delete: ' + targetName });
    const fields = within(dialog);
    const confirm = fields.getByRole('button', { name: 'Confirm Delete' });
    expect(confirm).toBeDisabled();
    await user.type(fields.getByLabelText('Current password'), 'wrongpassword');
    await user.type(fields.getByLabelText('Google Authenticator code'), '123456');
    await user.type(fields.getByLabelText('Type DELETE'), 'DELETE');
    await user.type(fields.getByLabelText('Type the exact name: ' + targetName), targetName);
    expect(confirm).toBeDisabled();
    expect(sensitiveAction).not.toHaveBeenCalled();
    await user.type(fields.getByLabelText('Reason'), 'Remove unused test unit');
    await user.click(confirm);
    expect(await fields.findByRole('alert')).toHaveTextContent('SYS-001');
    expect(fields.getByLabelText('Current password')).toHaveValue('');
    expect(fields.getByLabelText('Google Authenticator code')).toHaveValue('');
    expect(confirm).toBeDisabled();
    await user.type(fields.getByLabelText('Current password'), 'password123');
    await user.type(fields.getByLabelText('Google Authenticator code'), '123456');
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sensitiveAction).toHaveBeenCalledTimes(2);
    expect(sensitiveAction).toHaveBeenLastCalledWith('deleteSchoolNode', expect.any(String), {
      password: 'password123', code: '123456', typedAction: 'DELETE', typedName: targetName, reason: 'Remove unused test unit',
    });
  });
});
