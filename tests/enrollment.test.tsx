import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import LandingPage from '../views/LandingPage';
import { defaultLegalPages } from '../lib/legalPages';
import { loadLegalPage } from '../lib/legalPageStore';
vi.mock('../lib/legalPageStore', () => ({ loadLegalPage: vi.fn(async () => defaultLegalPages.agreement) }));
vi.mock('../lib/enrollmentConfirmation', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/enrollmentConfirmation')>();
  return { ...actual, loadConfirmationSettings: vi.fn(async () => actual.defaultConfirmationSettings) };
});

const api = vi.hoisted(() => ({ validate: vi.fn(), submit: vi.fn(), upload: vi.fn(), remove: vi.fn(), google: vi.fn(), googleSubmit: vi.fn(), signIn: vi.fn(), requestEmail: vi.fn() }));
vi.mock('../lib/emailDelivery', () => ({ requestAuthEmail: api.requestEmail }));
vi.mock('../components/GoogleSignIn', () => ({ default: ({ enrollment, onCredential, onError }: any) => <button onClick={() => onCredential('google-token', 'nonce').catch((error: Error) => onError(error.message))}>{enrollment ? 'Sign up with Google' : 'Sign in with Google'}</button> }));
vi.mock('../lib/googleAuth', () => ({ checkGoogle: api.google, submitGoogleEnrollment: api.googleSubmit }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null, loading: false, revision: 0 }) }));
vi.mock('../components/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../components/ui/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/academic/AcademicPathPicker', () => ({
  AcademicPathPicker: ({ onChange }: any) => <button onClick={() => onChange([
    { id: 'campus', name: 'Campus', type: 'campus' },
    { id: 'section', name: 'Section A', type: 'section' },
  ])}>Choose section</button>,
}));
vi.mock('../lib/backend', () => ({
  appAuth: { signIn: api.signIn }, refreshData: async () => undefined,
  appData: { getSchoolStructure: () => [{ id: 'campus' }], isMayorRegisteredForSection: () => false,
    validateEnrollment: api.validate, submitApplication: api.submit },
}));
vi.mock('../lib/googleDrive', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/googleDrive')>(),
  createDriveImage: api.upload, deleteDriveImage: api.remove,
  fileAsDataUrl: vi.fn(async () => 'data:image/png;base64,dGVzdA=='),
}));

beforeEach(() => {
  vi.resetAllMocks();
  api.validate.mockResolvedValue(undefined);
  api.submit.mockResolvedValue({ uid: 'new', needsEmailConfirmation: true });
  api.google.mockResolvedValue({ email: 'verified@gmail.com', needsEnrollment: true, enrollment: { credential: 'google-token', nonce: 'nonce', email: 'verified@gmail.com' } });
  api.googleSubmit.mockResolvedValue({ uid: 'new', needsEmailConfirmation: false });
  api.upload.mockResolvedValue({ id: 'photo123', url: 'https://lh3.googleusercontent.com/d/photo123=w4000' });
  vi.stubGlobal('Image', class {
    naturalWidth = 100; naturalHeight = 100; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Current route">{location.pathname}</output><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate(1)}>Browser forward</button></>;
}

function renderPublicPage(entry = '/') {
  return render(<MemoryRouter initialEntries={[entry]}>
    <NavigationProbe />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<LandingPage />} />
      <Route path="/login" element={<LandingPage defaultOpenLogin />} />
      <Route path="/register/status" element={<p>Application status page</p>} />
      <Route path="/dashboard" element={<p>Dashboard page</p>} />
    </Routes>
  </MemoryRouter>);
}

it('opens a dedicated password reset dialog without requiring login credentials', async () => {
  renderPublicPage('/login');
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'my.username' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByRole('dialog', { name: 'Forgot password?' })).toBeVisible();
  expect(screen.getByLabelText('Email address')).toHaveValue('');
  expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(api.requestEmail).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to login' }));
  expect(screen.getByRole('dialog', { name: 'Log in to IARS' })).toBeVisible();
  expect(screen.getByLabelText('Username or email')).toHaveValue('my.username');
});

it('prefills the recovery email and preserves the resend cooldown when reopening the dialog', async () => {
  api.requestEmail.mockResolvedValue({ accepted: true, cooldownSeconds: 120 });
  renderPublicPage('/login');
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'student@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByLabelText('Email address')).toHaveValue('student@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  await screen.findByText(/If this email has an account, its reset request is queued/);
  expect(api.requestEmail).toHaveBeenCalledExactlyOnceWith('recovery', 'student@example.com');
  expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to login' }));
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  expect(api.requestEmail).toHaveBeenCalledOnce();
});

it('keeps the reset email and allows retry after a delivery request fails', async () => {
  api.requestEmail.mockRejectedValueOnce(new Error('Email requests are temporarily unavailable. Try again later.'));
  renderPublicPage('/login');
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled());
  expect(screen.getByLabelText('Email address')).toHaveValue('student@example.com');
  expect(screen.getByRole('dialog', { name: 'Forgot password?' })).toHaveTextContent('Email requests are temporarily unavailable');
});

it('opens enrollment as a dedicated page and supports browser back and forward navigation', async () => {
  renderPublicPage();
  fireEvent.click(screen.getByRole('button', { name: /^Register$/ }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/register');
  expect(screen.getByRole('heading', { name: 'Create your student account' })).toHaveFocus();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Your school attendance')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
  expect(screen.queryByLabelText('Legal Full Name')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Browser forward' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/register');
  expect(screen.getByText('Step 1 of 5: Data privacy agreement')).toBeInTheDocument();
});

it('opens directly at /register and returns home with the back button', () => {
  renderPublicPage('/register');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
  expect(screen.queryByLabelText('Legal Full Name')).not.toBeInTheDocument();
});

it('preserves entered details when moving back a registration step', async () => {
  renderPublicPage('/register');
  await agreeToPrivacy();
  fill('name', 'Test Student'); fill('email', 'student@example.test');
  fill('password', 'StrongPassword123!'); fill('confirm-password', 'StrongPassword123!');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByLabelText('Official Student ID #');
  expect(screen.getByText('Academic assignment', { selector: 'li' })).toHaveAttribute('aria-current', 'step');
  fireEvent.click(screen.getByRole('button', { name: 'Previous registration phase' }));
  expect(screen.getByLabelText('Legal Full Name')).toHaveValue('Test Student');
  expect(screen.getByLabelText('Email Address')).toHaveValue('student@example.test');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('StrongPassword123!');
  expect(screen.getByRole('heading', { name: 'Create your student account' })).toHaveFocus();
});

async function agreeToPrivacy() {
  const panel = await screen.findByRole('region', { name: 'Data privacy agreement text' });
  Object.defineProperties(panel, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 }, scrollTop: { configurable: true, writable: true, value: 600 } });
  fireEvent.scroll(panel);
  fireEvent.click(screen.getByRole('checkbox', { name: 'I have read and agree to the Data Privacy Agreement.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function fill(id: string, value: string) {
  fireEvent.change(document.getElementById(`landing-register-${id}`)!, { target: { value } });
}
async function reachPhoto(google = false) {
  renderPublicPage('/register');
  await agreeToPrivacy();
  fill('name', 'Test Student');
  if (google) {
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));
    await screen.findByText(/Google email verified/);
    expect(screen.getByLabelText('Email Address')).toHaveValue('verified@gmail.com');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
    expect(api.submit).not.toHaveBeenCalled(); expect(api.googleSubmit).not.toHaveBeenCalled();
  } else fill('email', 'student@example.test');
  fill('password', 'StrongPassword123!'); fill('confirm-password', 'StrongPassword123!');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByLabelText('Official Student ID #');
  fill('student-id', '2026-12345A');
  fireEvent.click(screen.getByRole('button', { name: 'Choose section' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByLabelText('Guardian Name');
  fill('guardian-name', 'Test Guardian'); fill('guardian-phone', '09123456789');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByLabelText('Choose profile picture');
  fireEvent.change(document.getElementById('enrollment-photo')!, {
    target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
  });
  await screen.findByText('photo.png');
}

it('submits a photo URL accepted by the enrollment validator and shows email confirmation', async () => {
  await reachPhoto();
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText('Registration Submitted!');
  const profile = api.submit.mock.calls[0][0];
  expect(profile.photo_url).toBe('https://drive.google.com/thumbnail?id=photo123&sz=w1600');
  expect(api.validate).toHaveBeenLastCalledWith(profile, '', 4);
  expect(screen.getByRole('button', { name: 'Email confirmation required' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check email confirmation' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Resend confirmation email' })).toBeEnabled();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/register');
});

it('retains the uploaded photo after a failed signup and reuses it on retry', async () => {
  api.submit.mockRejectedValueOnce({ message: 'Connection interrupted' });
  await reachPhoto();
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText(/NET-001/);
  expect(api.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText('Registration Submitted!');
  expect(api.upload).toHaveBeenCalledTimes(1);
  expect(api.submit).toHaveBeenCalledTimes(2);
  expect(api.submit.mock.calls[1][0].photo_url).toBe(api.submit.mock.calls[0][0].photo_url);
});

it('rejects invalid details before uploading and allows a corrected retry', async () => {
  await reachPhoto();
  api.validate.mockRejectedValueOnce(new Error('Enrollment is frozen for this section.'));
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText(/FREEZE-001/);
  expect(api.upload).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText('Registration Submitted!');
});

it('keeps the selected photo when an invalid replacement is chosen', async () => {
  await reachPhoto();
  fireEvent.change(document.getElementById('enrollment-photo')!, {
    target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] },
  });
  await screen.findByText('Choose a JPG, PNG, or WebP image.');
  expect(screen.getByText('photo.png')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText('Registration Submitted!');
});

it('verifies Google without creating an account and submits only at the final step', async () => {
  await reachPhoto(true);
  expect(api.googleSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByText('Registration Submitted!');
  expect(api.submit).not.toHaveBeenCalled();
  expect(api.googleSubmit).toHaveBeenCalledWith(expect.objectContaining({ email: 'verified@gmail.com' }), 'StrongPassword123!', '', { credential: 'google-token', nonce: 'nonce', email: 'verified@gmail.com' });
  fireEvent.click(screen.getByRole('button', { name: 'View Application Status' }));
  expect(screen.getByText('Application status page')).toBeInTheDocument();
});
it('prompts an unknown Google login to enroll and carries the verified email into enrollment', async () => {
  renderPublicPage('/login');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  await screen.findByText('Account not found');
  expect(screen.getByRole('alert')).toHaveTextContent('verified@gmail.com');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
  expect(api.submit).not.toHaveBeenCalled(); expect(api.googleSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sign up with this Google email' }));
  await agreeToPrivacy();
  expect(screen.getByLabelText('Email Address')).toHaveValue('verified@gmail.com');
  expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
});
it('offers signup with the same email after an account-not-found password login', async () => {
  api.signIn.mockRejectedValue(Object.assign(new Error('Account not found'), { code: 'ACCOUNT_NOT_FOUND' }));
  renderPublicPage('/login');
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: ' New@Example.test ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await screen.findByText('Account not found');
  expect(screen.getByRole('alert')).toHaveTextContent('new@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Sign up with this email' }));
  await agreeToPrivacy();
  expect(screen.getByLabelText('Email Address')).toHaveValue('new@example.test');
  expect(screen.getByLabelText('Email Address')).not.toHaveAttribute('readonly');
  expect(api.submit).not.toHaveBeenCalled();
});
it('keeps credential failures separate from the signup prompt', async () => {
  api.signIn.mockRejectedValue(new Error('Unable to sign in. Check your credentials.'));
  renderPublicPage('/login');
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'existing@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await screen.findByText('Unable to sign in. Check your credentials.');
  expect(screen.queryByText('Account not found')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign up with this email' })).not.toBeInTheDocument();
});
it('routes an existing Google email away from enrollment without submitting another application', async () => {
  api.google.mockResolvedValue({ email: 'verified@gmail.com', session: { access_token: 'existing' }, existing: true });
  renderPublicPage('/register');
  await agreeToPrivacy();
  fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));
  await waitFor(() => expect(screen.queryByLabelText('Email Address')).not.toBeInTheDocument());
  expect(api.submit).not.toHaveBeenCalled(); expect(api.googleSubmit).not.toHaveBeenCalled();
});

it('requires reaching the agreement bottom and explicitly agreeing before account details or Google signup', async () => {
  renderPublicPage('/register');
  const panel = await screen.findByRole('region', { name: 'Data privacy agreement text' });
  const checkbox = screen.getByRole('checkbox', { name: 'I have read and agree to the Data Privacy Agreement.' });
  const next = screen.getByRole('button', { name: 'Next' });
  expect(checkbox).toBeDisabled();
  expect(next).toBeDisabled();
  expect(screen.queryByLabelText('Legal Full Name')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign up with Google' })).not.toBeInTheDocument();
  Object.defineProperties(panel, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 }, scrollTop: { configurable: true, writable: true, value: 300 } });
  fireEvent.scroll(panel);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  expect(checkbox).toBeDisabled();
  panel.scrollTop = 599;
  fireEvent.scroll(panel);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  expect(checkbox).toBeEnabled();
  expect(next).toBeDisabled();
  fireEvent.click(checkbox);
  fireEvent.click(next);
  expect(screen.getByLabelText('Legal Full Name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Previous registration phase' }));
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  expect(next).toBeDisabled();
  expect(api.validate).not.toHaveBeenCalled();
  expect(api.google).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled();
});

it('blocks enrollment when the current agreement cannot load and allows retry', async () => {
  vi.mocked(loadLegalPage).mockRejectedValueOnce(new Error('Offline'));
  renderPublicPage('/register');
  await screen.findByText('Unable to load the agreement. Please retry before continuing.');
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading agreement' }));
  await agreeToPrivacy();
  expect(screen.getByLabelText('Legal Full Name')).toBeInTheDocument();
});
