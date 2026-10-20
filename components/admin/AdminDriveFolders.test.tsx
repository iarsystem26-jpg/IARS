import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminDriveFolders from './AdminDriveFolders';

const api = vi.hoisted(() => ({ manage: vi.fn() }));
vi.mock('../../lib/googleDrive', () => ({ GOOGLE_DRIVE_GAS_URL: 'https://drive.test', manageDriveFolder: api.manage }));
const root = { id: 'root', name: 'IARS unit', url: 'https://drive.google.com/root', system: false };
const photo = { id: 'photos', name: 'Profile Photos', url: 'https://drive.google.com/photos', system: true };
const custom = { id: 'custom', name: 'School year 2026', url: 'https://drive.google.com/custom', system: false };
const result = { folder: root, folders: [photo, custom] };
beforeEach(() => { api.manage.mockReset(); api.manage.mockResolvedValue(result); });
afterEach(cleanup);

it('shows inline placeholders while loading and opens creation only on demand', async () => {
  let resolve!: (value: unknown) => void;
  api.manage.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(<AdminDriveFolders />);
  expect(screen.getByRole('status', { name: 'Loading Drive folders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'New folder' })).toBeDisabled();
  expect(screen.queryByLabelText('Folder name')).toBeNull();
  resolve(result);
  await screen.findByRole('button', { name: 'Open Profile Photos' });
  expect(screen.queryByRole('button', { name: 'Move Profile Photos to trash' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
  fireEvent.change(screen.getByLabelText(/Folder name/), { target: { value: 'New archive' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
  await waitFor(() => expect(api.manage).toHaveBeenCalledWith('create', 'root', 'New archive'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('keeps the current location after a failed navigation and navigates back with breadcrumbs', async () => {
  render(<AdminDriveFolders />);
  await screen.findByRole('button', { name: 'Open Profile Photos' });
  api.manage.mockRejectedValueOnce(new Error('Drive connection failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Open Profile Photos' }));
  await screen.findByRole('alert');
  expect(within(screen.getByRole('navigation', { name: 'Folder location' })).queryByText('Profile Photos')).toBeNull();
  api.manage.mockResolvedValueOnce({ folder: photo, folders: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Open Profile Photos' }));
  await screen.findByText('No subfolders yet');
  fireEvent.click(screen.getByRole('button', { name: 'Unit folders' }));
  await screen.findByRole('button', { name: 'Open Profile Photos' });
  expect(api.manage).toHaveBeenLastCalledWith('read', 'root');
});

it('filters folder names and requires confirmation before deleting a custom folder', async () => {
  render(<AdminDriveFolders />);
  await screen.findByRole('button', { name: 'Open Profile Photos' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'school' } });
  expect(screen.queryByRole('button', { name: 'Open Profile Photos' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Move School year 2026 to trash' }));
  expect(api.manage.mock.calls.some(call => call[0] === 'delete')).toBe(false);
  api.manage.mockRejectedValueOnce(new Error('Only empty folders can be moved to trash.'));
  fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(api.manage).toHaveBeenLastCalledWith('delete', 'custom');
});
