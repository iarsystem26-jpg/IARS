import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RegisterStatus from './RegisterStatus';

const api = vi.hoisted(() => ({ claim: vi.fn(), navigate: vi.fn(), signOut: vi.fn(), submit: vi.fn(), refresh: vi.fn(), upload: vi.fn(), rpc: vi.fn(), profile: null as any, application: null as any }));
vi.mock('react-router-dom', () => ({ useNavigate: () => api.navigate }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'student' }, profile: api.profile, loading: false }) }));
vi.mock('../lib/approvalNotice', () => ({ claimApprovalNotice: api.claim }));
vi.mock('../lib/backend', () => ({ appData: { getApplications: () => api.application ? [api.application] : [], isUserScopeFrozen: () => Boolean(api.profile?.account_freeze?.isFrozen), submitApplication: api.submit }, appAuth: { signOut: api.signOut }, refreshData: api.refresh, uploadDocument: api.upload, documentUrl: vi.fn(async value => value) }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: api.rpc } }));
vi.mock('../components/admin/FrozenAccess', () => ({ default: () => <p>Account frozen</p> }));
vi.mock('../components/ui/ThemeToggle', () => ({ default: () => null }));
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); api.profile = { uid: 'student' }; api.application = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows the first approval with a time bar and opens the dashboard after eight seconds', async () => {
  api.claim.mockResolvedValue(true);
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.getByText('Account approved')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
  act(() => vi.advanceTimersByTime(8000));
  expect(api.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});
it('skips an approval already recorded in the backend', async () => {
  api.claim.mockResolvedValue(false);
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.queryByText('Account approved')).toBeNull();
  expect(api.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});
it('allows opening the dashboard before the countdown ends', async () => {
  api.claim.mockResolvedValue(true);
  await act(async () => { render(<RegisterStatus />); });
  fireEvent.click(screen.getByRole('button', { name: 'Open dashboard' }));
  expect(api.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});
it('offers retry when the record cannot be saved', async () => {
  api.claim.mockRejectedValue(new Error('Offline'));
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save');
  act(() => vi.advanceTimersByTime(10000));
  expect(api.navigate).not.toHaveBeenCalled();
  api.claim.mockResolvedValue(true);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
  expect(screen.getByText('Account approved')).toBeInTheDocument();
});
it('keeps pending applications open without a countdown or approval write', async () => {
  api.profile = null;
  api.application = { id: 'student', status: 'pending', form_data: {} };
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.getByText('Admission review pending')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(api.claim).not.toHaveBeenCalled();
});
it('blocks approval navigation for an individually frozen applicant', async () => {
  api.profile = { uid: 'student', account_status: 'pending', account_freeze: { isFrozen: true } };
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.getByText('Account frozen')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10000));
  expect(api.claim).not.toHaveBeenCalled();
  expect(api.navigate).not.toHaveBeenCalled();
});

it('shows only requested corrections and documents and resubmits corrected details', async () => {
  api.profile = null;
  api.application = {
    id: 'student', status: 'bounced', rejection_reason: 'Please correct your name and profile photo.',
    clarification_fields: ['name', 'photo', 'id_front', 'id_back'],
    form_data: { name: 'Original name', student_id: '2023-39680T', school_data: { section: '2SP - B' } },
  };
  await act(async () => { render(<RegisterStatus />); });
  expect(screen.getByText('Clarification requested')).toBeInTheDocument();
  expect(screen.getByText(api.application.rejection_reason)).toBeInTheDocument();
  expect(screen.getByLabelText('Replace profile photo', { selector: 'input' })).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  expect(screen.queryByLabelText('Student ID front', { selector: 'input' })).toBeNull();
  expect(screen.queryByLabelText('Student ID back', { selector: 'input' })).toBeNull();
  expect(screen.queryByLabelText('Student ID', { selector: 'input' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Full name', { selector: 'input' }), { target: { value: ' Corrected name ' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit clarifications' })); });
  expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Corrected name', student_id: '2023-39680T', school_data: { section: '2SP - B' } }), '');
  expect(api.refresh).toHaveBeenCalled();
});

it('signs out and returns to login', async () => {
  api.profile = null;
  api.application = { id: 'student', status: 'pending', form_data: {} };
  await act(async () => { render(<RegisterStatus />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
  expect(api.signOut).toHaveBeenCalled();
  expect(api.navigate).toHaveBeenCalledWith('/login');
});

it('saves a selected document and refreshes the application', async () => {
  api.profile = null;
  api.application = { id: 'student', status: 'pending', form_data: {} };
  api.upload.mockResolvedValue('student/photo.png');
  api.rpc.mockResolvedValue({ error: null });
  const file = new File(['photo'], 'photo.png', { type: 'image/png' });
  await act(async () => { render(<RegisterStatus />); });
  await act(async () => { fireEvent.change(screen.getByLabelText('Profile photo', { selector: 'input' }), { target: { files: [file] } }); });
  expect(api.upload).toHaveBeenCalledWith(file, 'photo');
  expect(api.rpc).toHaveBeenCalledWith('rmc_admission_update', { documents: { photo: 'student/photo.png' } });
  expect(api.refresh).toHaveBeenCalled();
});

it('reports failed document uploads and allows another attempt', async () => {
  api.profile = null;
  api.application = { id: 'student', status: 'pending', form_data: {} };
  api.upload.mockRejectedValue(new Error('Upload failed. Please try again.'));
  await act(async () => { render(<RegisterStatus />); });
  const picker = screen.getByLabelText('Profile photo', { selector: 'input' });
  await act(async () => { fireEvent.change(picker, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } }); });
  expect(screen.getByRole('alert')).toHaveTextContent('Reconnect');
  expect(picker).not.toBeDisabled();
  expect(api.refresh).not.toHaveBeenCalled();
});

it('opens the complete submitted photo in a modal and closes with Escape or the close button', async () => {
  api.profile = null;
  api.application = { id: 'student', status: 'pending', form_data: {}, documents: { photo: '/student-photo.png' } };
  await act(async () => { render(<RegisterStatus />); });
  const trigger = screen.getByRole('button', { name: 'View submitted profile photo' });
  trigger.focus();
  await act(async () => { fireEvent.click(trigger); });
  const dialog = screen.getByRole('dialog', { name: 'Submitted profile photo' });
  expect(within(dialog).getByRole('img', { name: 'Full submitted profile photo' })).toHaveAttribute('src', '/student-photo.png');
  expect(document.body).toHaveClass('app-scroll-lock');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
  expect(document.body).not.toHaveClass('app-scroll-lock');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open submitted photo' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the app logo in the image modal and closes on backdrop click', async () => {
  api.profile = null;
  await act(async () => { render(<RegisterStatus />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'View app logo' })); });
  const dialog = screen.getByRole('dialog', { name: 'App logo' });
  expect(within(dialog).getByRole('img', { name: 'IARS Academic Seal' })).toHaveAttribute('src', '/academic-seal-transparent.png');
  fireEvent.click(screen.getByTestId('modal-backdrop'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
