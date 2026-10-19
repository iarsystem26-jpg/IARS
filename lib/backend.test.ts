import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ rpc: vi.fn(), select: vi.fn(), invoke: vi.fn(), signUp: vi.fn(), setSession: vi.fn(), getUser: vi.fn(), upload: vi.fn() }));
vi.mock('./supabase', () => ({
  requireConfiguration: () => {},
  supabase: { rpc: api.rpc, from: () => ({ select: api.select }), functions: { invoke: api.invoke }, auth: { signUp: api.signUp, setSession: api.setSession, getUser: api.getUser }, storage: { from: () => ({ upload: api.upload }) } },
}));
import { appAuth, appData, refreshData, resetData, subscribeData, uploadDocument } from './backend';
import { retainedUploadFile, selectUploadFile, uploadFileText } from './fileUploads';
import { toast, toastStore } from './toast';
import type { UserProfile } from '../types';

const applicant = { email: 'student@example.edu', name: 'Student', username: 'student_123', student_id: '123', school_data: {} } as UserProfile;
it('sends retained document bytes to Storage after the original picker becomes unavailable', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'student' } } });
  api.upload.mockResolvedValue({ error: null });
  const file = new File(['PDF bytes'], 'proof.pdf', { type: 'application/pdf' });
  selectUploadFile({ files: [file], value: 'proof.pdf' } as unknown as HTMLInputElement);
  const retained = await retainedUploadFile(file);
  expect(api.upload).not.toHaveBeenCalled();
  await expect(uploadDocument(file, 'excuses')).resolves.toMatch(/^storage:\/\/student\/excuses\//);
  expect(api.upload.mock.calls[0][1]).toBe(retained);
  expect(await uploadFileText(api.upload.mock.calls[0][1])).toBe('PDF bytes');
  expect(api.upload.mock.calls[0][2]).toEqual({ upsert: false });
  api.upload.mockClear();
});
it('applies an individual freeze to admins before the school-freeze exemption', () => {
  expect(appData.isUserScopeFrozen({ role: 'admin', account_freeze: { isFrozen: true, reason: 'Review', frozenAt: 123 } } as UserProfile)).toBe(true);
  expect(appData.isUserScopeFrozen({ role: 'admin' } as UserProfile)).toBe(false);
});
it('preserves the account-not-found code from an HTTP error response', async () => {
  api.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' }) } } });
  await expect(appAuth.signIn('new@example.test', 'password')).rejects.toMatchObject({ message: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
  expect(api.setSession).not.toHaveBeenCalled();
});
it('accepts email login and establishes the returned session', async () => {
  const session = { access_token: 'access', refresh_token: 'refresh' };
  api.invoke.mockResolvedValue({ data: session, error: null });
  api.setSession.mockResolvedValue({ error: null });
  await appAuth.signIn(' existing@example.test ', 'password');
  expect(api.invoke).toHaveBeenCalledWith('rmc-login', { body: { identifier: 'existing@example.test', password: 'password' } });
  expect(api.setSession).toHaveBeenCalledWith(session);
});
it('submits the admission profile and key through Supabase and reports email confirmation', async () => {
  resetData();
  api.invoke.mockResolvedValue({ data: { uid: 'new', needsEmailConfirmation: true }, error: null });
  await expect(appData.submitApplication(applicant, 'strong-password', 'SECTION-KEY')).resolves.toEqual({ uid: 'new', needsEmailConfirmation: true });
  expect(api.invoke).toHaveBeenCalledWith('rmc-enroll', { body: { action: 'enroll', profile: applicant, password: 'strong-password', enrollmentKey: 'SECTION-KEY' } });
  expect(api.signUp).not.toHaveBeenCalled();
});
it('does not report a duplicate signup as a newly submitted application', async () => {
  resetData();
  api.invoke.mockResolvedValue({ data: { error: 'This email is already registered. Sign in to track your application.' }, error: null });
  await expect(appData.submitApplication(applicant, 'strong-password')).rejects.toThrow('already registered');
});
it('prevents a signed-in student from creating another account', async () => {
  await expect(appData.submitApplication(applicant, 'strong-password')).rejects.toThrow('already have an account');
  expect(api.signUp).not.toHaveBeenCalled();
});
it('preserves a successful resubmission when its subsequent refresh fails', async () => {
  api.rpc.mockResolvedValueOnce({ data: { ...snapshot(), applications: [{ id: 'student', status: 'rejected' }] }, error: null });
  await refreshData();
  api.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Offline' } });
  await expect(appData.submitApplication(applicant, '')).resolves.toEqual({ uid: 'student', needsEmailConfirmation: false });
  expect(api.signUp).not.toHaveBeenCalled();
  expect(toastStore.getSnapshot()).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Submit application', kind: 'error', phase: 1, message: expect.stringContaining('Changes saved') })]));
});

function snapshot() {
  return {
    nodes: [], roles: {}, settings: {}, audit: [], applications: [], excuses: [],
    profiles: [{ uid: 'student', role: 'student', name: 'Student', account_status: 'active', school_data: {} }, { uid: 'pending', role: 'student', account_status: 'pending', school_data: {} }],
    events: [{ id: 'event', title: 'Assembly', startTime: 1, endTime: 2 }],
    attendance: [
      { student_id: 'student', event_id: 'event', slot: '2026-09-19:morning', data: { status: 'present', time_in: 1 } },
      { student_id: 'student', event_id: 'event', slot: '2026-09-19:afternoon', data: { status: 'absent' } },
    ],
    sanctions: [{ student_id: 'student', data: { id: 'penalty', change: 2 } }, { student_id: 'student', data: { id: 'service', change: -0.5 } }],
  };
}
it('marks a failed read as degraded while preserving the last successful snapshot', async () => {
  api.rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  await refreshData();
  const successful = appData.getSystemHealthMetrics();
  expect(successful.syncSuccesses).toBe(1); expect(successful.latencySamples).toHaveLength(1);
  api.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network unavailable' } });
  await expect(refreshData()).rejects.toMatchObject({ message: 'Network unavailable' });
  expect(appData.getSystemHealthMetrics()).toMatchObject({ dbStatus: 'degraded', lastSync: successful.lastSync, syncFailures: 1, syncSuccesses: 1 });
  expect(appData.getEvents()).toHaveLength(1);
  api.rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  await refreshData();
  expect(appData.getSystemHealthMetrics()).toMatchObject({ dbStatus: 'operational', syncFailures: 1, syncSuccesses: 2 });
});
it('resolves missing audit names from visible records and preserves recorded names', async () => {
  api.rpc.mockResolvedValueOnce({ data: { ...snapshot(), audit: [
    { id: 'first', actor_uid: 'student', target_uid: 'event', action: 'attendance.offline_prepare', timestamp: 1 },
    { id: 'second', actor_uid: 'student', actor_name: 'Recorded name', target_uid: 'student', timestamp: 2 },
  ] }, error: null });
  await refreshData();
  expect(appData.getAccountAuditLogs()).toEqual([
    expect.objectContaining({ actor_name: 'Recorded name', target_name: 'Student', target_role: 'student' }),
    expect.objectContaining({ actor_name: 'Student', target_name: 'Assembly' }),
  ]);
});
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); resetData('student'); });
afterEach(() => { resetData(); });

it('keeps unchanged profiles stable and only marks actual snapshot changes as updates', async () => {
  api.rpc.mockImplementation(async () => ({ data: structuredClone(snapshot()), error: null }));
  const updates = vi.fn();
  const unsubscribe = subscribeData(updates);
  try {
    await refreshData();
    const profile = appAuth.getCurrentUser()?.profile;
    await refreshData();
    expect(appAuth.getCurrentUser()?.profile).toBe(profile);
    expect(updates.mock.calls.map(call => call[0])).toEqual([true, false]);
    api.rpc.mockResolvedValueOnce({ data: { ...snapshot(), events: [] }, error: null });
    await refreshData();
    expect(appData.getEvents()).toEqual([]);
    expect(appAuth.getCurrentUser()?.profile).toBe(profile);
    expect(updates).toHaveBeenLastCalledWith(true);
  } finally { unsubscribe(); }
});

it.each(['ssg', 'student'])('shows school-wide general events to an unassigned %s without exposing restricted events', async role => {
  const data = snapshot();
  data.profiles[0].role = role;
  const general = { id: 'general', title: 'Intramurals', startTime: 1, endTime: 2, isGeneralEvent: true, recipientGroups: ['All Students'], audienceTarget: { mode: 'all' } };
  const events = [general,
    { ...general, id: 'restricted', scopeNodeId: 'another-unit' },
    { ...general, id: 'pending-approval', approvalStatus: 'pending' },
  ];
  api.rpc.mockResolvedValue({ data: { ...data, events }, error: null });
  await refreshData();
  expect(appData.getVisibleEvents('student').map(event => event.id)).toEqual(['general']);
  expect(appData.getRecipientEvents('student').map(event => event.id)).toEqual(['general']);
  expect(appData.getVisibleEvents('unknown')).toEqual([]);
});

it('starts empty and never seeds or persists school records in local storage', () => {
  expect(appData.getEvents()).toEqual([]);
  expect(appData.getAllStudents()).toEqual([]);
  expect(localStorage.length).toBe(0);
});

it('reads account access without reporting an update or refreshing the snapshot', async () => {
  toastStore.getSnapshot().forEach(item => toast.dismiss(item.id));
  api.invoke.mockResolvedValue({ data: { users: [{ id: 'student', last_sign_in_at: null }] }, error: null });
  expect(await appData.getAccountAccess()).toEqual({ student: { id: 'student', last_sign_in_at: null } });
  expect(api.invoke).toHaveBeenCalledWith('rmc-accounts', { body: { action: 'access', data: {} } });
  expect(api.rpc).not.toHaveBeenCalled();
  expect(toastStore.getSnapshot()).toHaveLength(0);
});
it('preserves each attendance window and maps the event and sanction balance', async () => {
  api.rpc.mockResolvedValue({ data: snapshot(), error: null });
  await refreshData();
  expect(appData.getAttendanceRecords('student')).toEqual([
    expect.objectContaining({ slot: '2026-09-19:morning', status: 'present', event: expect.objectContaining({ title: 'Assembly' }) }),
    expect.objectContaining({ slot: '2026-09-19:afternoon', status: 'absent' }),
  ]);
  expect(appData.getUserDetail('student')?.stats).toMatchObject({ sanction_hours: 1.5, attendance_rate: 50 });
  expect(appData.getAttendanceLogs('event').student.status).toBe('absent');
  expect(localStorage.length).toBe(0);
});

it('keeps earned merit separate from outstanding sanctions', async () => {
  api.rpc.mockResolvedValue({ data: { ...snapshot(), merit_credits: [{student_id:'student',hours:1.25},{student_id:'student',hours:0.5},{student_id:'pending',hours:9}] }, error:null });
  await refreshData();
  expect(appData.getUserDetail('student')?.stats).toEqual(expect.objectContaining({merit_hours:1.75,sanction_hours:1.5}));
});
it('includes signed correction entries in the saved merit balance', async () => {
  api.rpc.mockResolvedValue({ data: { ...snapshot(), merit_credits: [{ student_id: 'student', hours: 2 }, { student_id: 'student', hours: -1.25 }] }, error: null });
  await refreshData();
  expect(appData.getUserDetail('student')?.stats).toMatchObject({ merit_hours: 0.75, sanction_hours: 1.5 });
});
it('excludes pending admissions from active student registers', async () => {
  api.rpc.mockResolvedValue({ data: snapshot(), error: null });
  await refreshData();
  expect(appData.getAllStudents().map(p => p.uid)).toEqual(['student']);
});
it('discards a response belonging to the account that signed out', async () => {
  let resolve!: (value: unknown) => void;
  api.rpc.mockReturnValue(new Promise(r => { resolve = r; }));
  const request = refreshData();
  resetData(); resolve({ data: snapshot(), error: null }); await request;
  expect(appData.getAllStudents()).toEqual([]);
});
it('does not let an older polling request overwrite a newer snapshot', async () => {
  let resolve!: (value: unknown) => void;
  api.rpc.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValueOnce({ data: snapshot(), error: null });
  const first = refreshData(); await refreshData();
  resolve({ data: { ...snapshot(), events: [] }, error: null }); await first;
  expect(appData.getEvents()).toHaveLength(1);
});
it('propagates a denied write without changing local records', async () => {
  api.rpc.mockResolvedValue({ data: null, error: { message: 'Permission required: events.manage' } });
  await expect(appData.createEvent({ title: 'Forbidden' })).rejects.toThrow('Permission required');
  expect(appData.getEvents()).toEqual([]);
  expect(api.rpc).toHaveBeenCalledOnce();
});
it('reports a refresh failure after a committed write without prompting a duplicate write', async () => {
  api.rpc.mockResolvedValueOnce({ data: 'created-id', error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Network unavailable' } });
  const listener = vi.fn(); window.addEventListener('rmc_sync_error', listener);
  try {
    await expect(appData.createEvent({ title: 'Assembly' })).resolves.toBe('created-id');
    expect(listener).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('rmc_sync_error', listener); }
});
it('sends scanner verification to the server and omits client-supplied actor and clock', async () => {
  api.rpc.mockResolvedValueOnce({ data: { status: 'present' }, error: null }).mockResolvedValueOnce({ data: snapshot(), error: null });
  await appData.logAttendance('event', 'student', 'forged-actor', 'forged-name', 123, 'in', { qrToken: 'RMC1.token' });
  expect(api.rpc).toHaveBeenNthCalledWith(1, 'rmc_record_attendance', { event_id: 'event', student_id: 'student', direction: 'in', qr_token: 'RMC1.token', scan_position: null, manual_reason: null });
});
