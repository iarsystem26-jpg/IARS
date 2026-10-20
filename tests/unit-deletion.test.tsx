import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import SSGPanel from '../views/SSGPanel';
import { ensureMockReferenceData } from './fixtures/demoBackend';

const sensitiveAction = vi.hoisted(() => vi.fn());
const beginDeletion = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/supabase')>(),
  sensitiveActionRequiresMfa: vi.fn().mockResolvedValue(true),
}));
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

vi.mock('../lib/backend', async () => { const m = await import('./fixtures/demoBackend'); return { appData: { ...m.mockData, performSensitiveAction: sensitiveAction,
  beginUnitDeletion: beginDeletion,
}, appAuth: m.mockAuth, documentUrl: async (p: string) => p }; });

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
    sensitiveAction.mockReset().mockRejectedValueOnce(new Error('Records changed; reload the review')).mockResolvedValueOnce(undefined);
    beginDeletion.mockReset().mockRejectedValueOnce(new Error('Incorrect password')).mockImplementation(async (id: string) => ({
      preview: { version: 'review-version', records: [{ key: `unit:${id}`, id, kind: 'unit', name: 'Unit', detail: '', nodeIds: [], destinationType: null, canDelete: true, blockedReason: null }], destinations: [] },
      expiresAt: Date.now() + 110000, close: vi.fn(), reload: vi.fn(), confirm: sensitiveAction,
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><SSGPanel /></MemoryRouter>);
    const deleteButton = screen.getAllByRole('button', { name: /delete unit/i })[0];
    const targetName = deleteButton.getAttribute('title')!.replace(/^Delete /, '');
    await user.click(deleteButton);
    const dialog = screen.getByRole('dialog', { name: 'Delete academic unit' });
    const fields = within(dialog);
    expect(beginDeletion).not.toHaveBeenCalled();
    expect(fields.queryByRole('button', { name: 'Review and confirm deletion' })).not.toBeInTheDocument();
    await user.type(fields.getByLabelText('Current password'), 'wrongpassword');
    await user.type(await fields.findByLabelText(/Google Authenticator code/), '123456');
    await user.click(fields.getByRole('button', { name: 'Verify and review records' }));
    expect(await fields.findByRole('alert')).toHaveTextContent('SYS-001');
    expect(fields.getByLabelText('Current password')).toHaveValue('');
    expect(fields.getByLabelText(/Google Authenticator code/)).toHaveValue('');
    await user.type(fields.getByLabelText('Current password'), 'password123');
    await user.type(fields.getByLabelText(/Google Authenticator code/), '123456');
    await user.click(fields.getByRole('button', { name: 'Verify and review records' }));
    await user.click(await fields.findByRole('button', { name: 'Review and confirm deletion' }));
    const confirm = fields.getByRole('button', { name: 'Confirm Delete' });
    expect(confirm).toBeDisabled();
    await user.type(fields.getByLabelText('Type DELETE'), 'DELETE');
    await user.type(fields.getByLabelText('Type the exact name: ' + targetName), targetName);
    expect(confirm).toBeDisabled();
    expect(sensitiveAction).not.toHaveBeenCalled();
    await user.type(fields.getByLabelText('Reason'), 'Remove unused test unit');
    await user.click(confirm);
    expect(await fields.findByRole('alert')).toBeInTheDocument();
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sensitiveAction).toHaveBeenCalledTimes(2);
    expect(sensitiveAction).toHaveBeenLastCalledWith({ typedAction: 'DELETE', typedName: targetName, reason: 'Remove unused test unit' },
      { version: 'review-version', deleteKeys: [expect.stringMatching(/^unit:/)], transfers: {} });
  });
});
