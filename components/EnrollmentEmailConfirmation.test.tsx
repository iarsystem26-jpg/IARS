import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EnrollmentEmailConfirmation from './EnrollmentEmailConfirmation';
import { defaultConfirmationSettings } from '../lib/enrollmentConfirmation';
const api = vi.hoisted(() => ({ user: vi.fn(), login: vi.fn(), setSession: vi.fn(), signOut: vi.fn(), resend: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: api.login, signOut: api.signOut } }) }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getUser: api.user, setSession: api.setSession } } }));
vi.mock('../lib/backend', () => ({ appAuth: { resendConfirmation: api.resend } }));
beforeEach(() => { vi.resetAllMocks(); api.user.mockResolvedValue({ data: { user: null } }); api.setSession.mockResolvedValue({}); api.signOut.mockResolvedValue({}); api.resend.mockResolvedValue({}); });
afterEach(cleanup);
it('does not accept a successful password login as proof of email confirmation', async () => {
 api.login.mockResolvedValue({ data: { user: { email_confirmed_at: null }, session: { access_token: 'token' } } });
 const onConfirmed = vi.fn(); render(<EnrollmentEmailConfirmation email="student@example.test" settings={defaultConfirmationSettings} onConfirmed={onConfirmed} />);
 fireEvent.click(screen.getByText('Check email confirmation'));
 await screen.findByRole('alert'); expect(onConfirmed).not.toHaveBeenCalled(); expect(api.setSession).not.toHaveBeenCalled();
});
it('transfers a confirmed session without revoking the active session', async () => {
 const session = { access_token: 'token', refresh_token: 'refresh' };
 api.login.mockResolvedValue({ data: { user: { email_confirmed_at: '2026-10-12' }, session } });
 const onConfirmed = vi.fn(); render(<EnrollmentEmailConfirmation email="student@example.test" settings={defaultConfirmationSettings} onConfirmed={onConfirmed} />);
 fireEvent.change(screen.getByLabelText('Enrollment password'), { target: { value: 'secret' } });
 fireEvent.click(screen.getByText('Check email confirmation'));
 await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce()); expect(api.setSession).toHaveBeenCalledWith(session); expect(api.signOut).not.toHaveBeenCalled();
 expect(screen.getByLabelText('Enrollment password')).toHaveValue('');
});
it('accepts confirmation from the email link only for the matching email', async () => {
 api.user.mockResolvedValue({ data: { user: { email: 'student@example.test', email_confirmed_at: '2026-10-12' } } });
 const onConfirmed = vi.fn(); render(<EnrollmentEmailConfirmation email="student@example.test" settings={defaultConfirmationSettings} onConfirmed={onConfirmed} />);
 fireEvent.click(screen.getByText('Check email confirmation')); await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce()); expect(api.login).not.toHaveBeenCalled();
});
it('requests resend without marking the email confirmed', async () => {
 const onConfirmed = vi.fn(); render(<EnrollmentEmailConfirmation email="student@example.test" settings={defaultConfirmationSettings} onConfirmed={onConfirmed} />);
 fireEvent.click(screen.getByText('Resend confirmation email')); await screen.findByText('Request received. If confirmation is needed, one email is queued. You can close this page and return after delivery.');
 expect(api.resend).toHaveBeenCalledWith('student@example.test'); expect(onConfirmed).not.toHaveBeenCalled();
});
