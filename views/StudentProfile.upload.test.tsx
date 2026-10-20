import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentProfile from './StudentProfile';
import { toast, toastStore } from '../lib/toast';

const api = vi.hoisted(() => ({ save: vi.fn() }));
vi.hoisted(() => vi.stubEnv('VITE_GOOGLE_DRIVE_GAS_URL', 'https://image-service.test/exec'));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }) }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: {
  uid: 'student', name: 'Student', student_id: '123', role: 'student', email: 'test@example.test', photo_url: '', school_data: {},
} }) }));
vi.mock('../lib/backend', () => ({ appAuth: {}, appData: { getSchoolStructure: () => [], updatePhoto: api.save } }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  mfa: { listFactors: async () => ({ data: { totp: [] } }) },
} } }));
vi.mock('../components/PasskeySettings', () => ({ default: () => null }));
vi.mock('../components/members/ProfileRequests', () => ({ default: () => null }));
vi.mock('../components/ui/ProfileAvatar', () => ({ default: () => null }));

beforeEach(() => { api.save.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); toastStore.getSnapshot().forEach(item => toast.dismiss(item.id)); });
afterAll(() => vi.unstubAllEnvs());

it('retains a profile photo locally, uploads only on Save, and allows retry after upload failure', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('Network offline')).mockResolvedValue({
    ok: true, status: 200, text: async () => '{"success":true,"id":"profile-photo","url":"https://drive.google.com/thumbnail?id=profile-photo"}',
  });
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter><StudentProfile /></MemoryRouter>);
  const file = new File(['photo bytes'], 'gallery.jpg', { type: 'image/jpeg' });
  fireEvent.change(document.getElementById('profile-photo-file')!, { target: { files: [file] } });
  await screen.findByText(/gallery.jpg/);
  expect(fetcher).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save photo' })).toBeEnabled());
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith('student', 'https://drive.google.com/thumbnail?id=profile-photo&sz=w1600'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  const body = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(body.dataUrl).toBe('data:image/jpeg;base64,cGhvdG8gYnl0ZXM=');
});

it('cancels a selected profile photo without uploading or replacing the saved photo', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter><StudentProfile /></MemoryRouter>);
  fireEvent.change(document.getElementById('profile-photo-file')!, { target: { files: [new File(['photo'], 'cancel.jpg', { type: 'image/jpeg' })] } });
  await screen.findByText(/cancel.jpg/);
  fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
  expect(screen.queryByRole('button', { name: 'Save photo' })).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});
