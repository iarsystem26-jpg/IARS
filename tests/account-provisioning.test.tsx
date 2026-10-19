import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NodeOfficerManager } from '../components/academic/NodeOfficerManager';
import { AdminAccountView } from '../components/admin/AdminAccountView';
import { appData } from '../lib/backend';
import { SchoolNode, UserProfile } from '../types';
import { changeField as fill } from './ui-select';

vi.mock('../lib/backend', () => ({
  subscribeData: (callback: () => void) => { window.addEventListener('rmc_data_update', callback); return () => window.removeEventListener('rmc_data_update', callback); },
  documentUrl: vi.fn(async (path: string) => path),
  appData: {
  getCoreRoles: () => ({}), getCustomRoles: () => ({}), getOfficialsForNode: vi.fn((): UserProfile[] => []),
  getOfficialAccounts: vi.fn((): UserProfile[] => []), getSchoolStructure: vi.fn(), getAccountAccess: vi.fn(async () => ({})),
  getSchoolNodePath: vi.fn(() => []), getApplications: vi.fn(() => []), resetAccountPassword: vi.fn(async () => {}),
  createSchoolOfficial: vi.fn(async () => 'new-id'), createUser: vi.fn(async () => 'new-id'),
} }));
const campus: SchoolNode = { id: 'campus', name: 'Campus', type: 'education_unit', children: [
  { id: 'department', name: 'Department', type: 'department' },
  { id: 'archived', name: 'Archived', type: 'department', metadata: { archived: true } },
] };
const actor = { uid: 'admin', role: 'admin' } as UserProfile;
const chooseUnit = (label: RegExp, option: string) => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
function fillOfficer(index: number) {
  fill('Full name', `Officer ${index}`); fill('Email', `officer${index}@example.test`);
  fill('Username', `officer${index}`); fill('Official ID', `ID${index}`); fill('Temporary password', 'Example-password-123!');
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(appData.getSchoolStructure).mockReturnValue([campus]); vi.mocked(appData.getOfficialAccounts).mockReturnValue([]); vi.mocked(appData.getOfficialsForNode).mockReturnValue([]); });
afterEach(cleanup);

describe('Multiple managed accounts', () => {
  it.each(['ssg', 'ossa'])('hides officer deletion from a default %s without account-management permission', role => {
    vi.mocked(appData.getOfficialsForNode).mockReturnValue([{ uid: 'officer', name: 'Assigned Officer', role: 'ssg' } as UserProfile]);
    render(<NodeOfficerManager actor={{ ...actor, role }} node={campus} canManage onChanged={vi.fn()} />);
    expect(screen.getByText('Assigned Officer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Assigned Officer' })).not.toBeInTheDocument();
  });
  it.each(['admin', 'ossa', 'ossa_staff', 'ssg'])('creates two separate %s accounts from the officer dialog', async role => {
    render(<NodeOfficerManager actor={actor} node={campus} canManage onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign officer' }));
    fill('Role', role);
    fireEvent.click(screen.getByLabelText('Create another account with this role and unit'));
    for (const index of [1, 2]) {
      fillOfficer(index);
      fireEvent.click(screen.getByRole('button', { name: role === 'admin' ? 'Create account' : 'Create and assign' }));
      await waitFor(() => expect(appData.createSchoolOfficial).toHaveBeenCalledTimes(index));
      await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue(''));
      expect(screen.getByLabelText('Role')).toHaveValue(role);
      const profile = vi.mocked(appData.createSchoolOfficial).mock.calls[index - 1][1];
      expect(profile).toMatchObject({ role, name: `Officer ${index}`, email: `officer${index}@example.test` });
      if (role === 'admin') expect(profile.official_data).toBeUndefined();
      else expect(profile.official_data?.assignment_node_id).toBe('campus');
    }
  });

  it('filters assignments and shows creation errors inside the admin dialog', async () => {
    vi.mocked(appData.createUser).mockRejectedValueOnce(new Error('Email already exists.'));
    render(<AdminAccountView />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryByRole('button', { name: /^Department/ })).toBeNull();
    fill('Access role', 'ssg');
    chooseUnit(/^Education Unit/i, 'Campus');
    fireEvent.click(screen.getByRole('button', { name: /^Department/ }));
    expect(screen.queryByRole('option', { name: 'Archived' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Department' }));
    fill('Full name', 'SSG One'); fill('Email', 'ssg@example.test'); fill('Username', 'ssg-one');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
    expect(screen.getByLabelText('Full name')).toHaveValue('SSG One');
  });

  it('keeps the selected role and unit when creating another managed account', async () => {
    render(<AdminAccountView />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    fill('Access role', 'ossa_staff'); chooseUnit(/^Education Unit/i, 'Campus');
    fireEvent.click(screen.getByLabelText('Create another account with this role and unit'));
    for (const index of [1, 2]) {
      fill('Full name', `Staff ${index}`); fill('Email', `staff${index}@example.test`); fill('Username', `staff${index}`);
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      await waitFor(() => expect(appData.createUser).toHaveBeenCalledTimes(index));
      await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue(''));
      expect(screen.getByLabelText('Access role')).toHaveValue('ossa_staff');
      expect(screen.getByLabelText('Selected academic path')).toHaveTextContent('Campus');
      expect(vi.mocked(appData.createUser).mock.calls[index - 1][0].official_data?.assignment_node_id).toBe('campus');
      expect(screen.getByRole('status')).toHaveTextContent('Copy the initial password');
    }
  });

  it('does not offer account creation without account-management permission', () => {
    render(<NodeOfficerManager actor={{ ...actor, role: 'ssg' }} node={campus} canManage onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Assign officer' })).toBeNull();
  });

  it('shows the saved photo and only linked enrollment applications, and validates password updates', async () => {
    const account = { uid: 'officer', name: 'Officer One', username: 'officer', email: 'one@example.test', student_id: 'ONE', role: 'ssg', photo_url: 'https://example.test/photo.png', school_data: { type: 'College', level: '1', section: 'A' } } as UserProfile;
    vi.mocked(appData.getOfficialAccounts).mockReturnValue([account]);
    vi.mocked(appData.getApplications).mockReturnValue([
      { id: 'officer', form_data: account, status: 'approved', submission_date: 1, rejection_count: 0 },
      { id: 'other', form_data: { ...account, uid: 'other', name: 'Other applicant' }, status: 'pending', submission_date: 2, rejection_count: 0 },
    ]);
    render(<AdminAccountView />);
    fireEvent.click(screen.getByRole('button', { name: 'View profile for Officer One' }));
    await waitFor(() => expect(screen.getAllByAltText("Officer One's profile photo")[1]).toHaveAttribute('src', account.photo_url));
    expect(screen.getByRole('region', { name: 'Enrollment applications' })).toHaveTextContent('approved');
    expect(screen.queryByText('Other applicant')).not.toBeInTheDocument();
    expect(screen.getByText('Last sign-in (Manila time)').nextElementSibling).toHaveTextContent('Unavailable');
    const input = screen.getByLabelText('New password');
    expect(input).toHaveAttribute('type', 'password');
    fill('New password', 'abcdefghijklmnop');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }));
    expect(input).toHaveAttribute('type', 'text');
    const password = (input as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(appData.resetAccountPassword).toHaveBeenCalledWith('officer', password));
    expect(await screen.findByText('Password updated for Officer One.')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('shows password errors inside the profile and permits a retry', async () => {
    vi.mocked(appData.getOfficialAccounts).mockReturnValue([{ ...actor, name: 'Admin', username: 'admin', photo_url: '', school_data: {} } as UserProfile]);
    vi.mocked(appData.resetAccountPassword).mockRejectedValueOnce(new Error('Update failed.'));
    render(<AdminAccountView />);
    fireEvent.click(screen.getByRole('button', { name: 'View profile for Admin' }));
    fill('New password', 'Example-password-123!');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  });

  it('updates the account directory when new profile data arrives', () => {
    render(<AdminAccountView />);
    vi.mocked(appData.getOfficialAccounts).mockReturnValue([{ ...actor, name: 'New admin' } as UserProfile]);
    fireEvent(window, new Event('rmc_data_update'));
    expect(screen.getByText('New admin')).toBeInTheDocument();
  });
});
