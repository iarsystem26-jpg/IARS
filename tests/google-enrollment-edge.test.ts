// The handler is tested with injected clients; no real Auth users are created.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { enrollmentHandler } from '../supabase/functions/_shared/enrollment';

const nonce = 'a'.repeat(64);
afterEach(() => vi.unstubAllGlobals());
const profile = { email: 'spoofed@example.test', name: 'Student', username: 'student', student_id: '2026-12345A' };
let admin: any, client: any, verify: any, find: any, rpc: any, policy: any, mail: any;
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  find = vi.fn().mockResolvedValue({ data: null });
  policy = { mode: 'required', email_kind: 'supabase', email_subject: 'Confirm', email_body: 'Welcome' };
  rpc = vi.fn(async (name: string) => ({ data: name === 'rmc_validate_enrollment' ? {} : 0 }));
  admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: find, single: async () => ({ data: policy }) }) }) }), rpc,
    auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new' } } }) } } };
  client = { auth: { resend: vi.fn().mockResolvedValue({}), signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: 'access', refresh_token: 'refresh' } } }), signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'new', identities: [{}] }, session: null } }),
    signInWithIdToken: vi.fn().mockResolvedValue({ data: { user: { id: 'new' }, session: { access_token: 'access', refresh_token: 'refresh' } } }) } };
  verify = vi.fn().mockResolvedValue('verified@gmail.com');
  mail = {ready:true,send:vi.fn().mockResolvedValue(undefined)};
});
async function call(body: any) {
  const response = await enrollmentHandler(admin, client, verify, mail)(new Request('https://backend.test', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}
const google = { credential: 'signed-google-jwt', nonce };
const enroll = { action: 'enroll', profile, password: 'StrongPassword123!', enrollmentKey: 'SECTION' };
it('prompts an unknown Google email to enroll without creating an Auth user or session', async () => {
  expect((await call({ action: 'google', ...google })).body).toEqual({ email: 'verified@gmail.com', needsEnrollment: true });
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
  expect(client.auth.signUp).not.toHaveBeenCalled();
});
it.each(['active', 'pending'])('signs in an existing %s account without a second enrollment', async status => {
  find.mockResolvedValue({ data: { id: 'new', status } });
  expect((await call({ action: 'google', ...google })).body.session.access_token).toBe('access');
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalledWith('rmc_enrollment_reserve', expect.anything());
});
it('uses the server-verified email and creates only after complete validation', async () => {
  const result = await call({ ...enroll, ...google });
  expect(result.status).toBe(200);
  expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'verified@gmail.com', email_confirm: true,
    user_metadata: expect.objectContaining({ profile: expect.objectContaining({ email: 'verified@gmail.com' }), enrollment_ticket: expect.any(String) }) }));
  expect(rpc.mock.calls.map((call: any[]) => call[0])).toEqual(['rmc_edge_rate_limit', 'rmc_login_limit', 'rmc_validate_enrollment', 'rmc_enrollment_reserve']);
});
it('rejects invalid or expired Google proof before any lookup, session, or creation', async () => {
  verify.mockRejectedValue(new Error('Invalid Google token'));
  expect((await call({ action: 'google', ...google })).status).toBe(400);
  expect(find).not.toHaveBeenCalled(); expect(rpc.mock.calls.map((call: any[]) => call[0])).toEqual(['rmc_edge_rate_limit']);
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('does not create an account when enrollment validation fails', async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === 'rmc_validate_enrollment' ? { section: 'Enrollment is frozen.' } : 0 }));
  expect((await call({ ...enroll, ...google })).body.error).toContain('frozen');
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled(); expect(client.auth.signUp).not.toHaveBeenCalled();
});
it('enforces cooldown without creating an account', async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === 'rmc_enrollment_reserve' ? 60 : name === 'rmc_validate_enrollment' ? {} : 0 }));
  const result = await call({ ...enroll, ...google });
  expect(result.status).toBe(429); expect(result.body.retryAfter).toBe(60);
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('reuses a concurrently created Google account after a duplicate creation response', async () => {
  find.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { id: 'new', status: 'pending' } });
  admin.auth.admin.createUser.mockResolvedValue({ error: { message: 'Email already exists' } });
  expect((await call({ ...enroll, ...google })).body.uid).toBe('new');
  expect(admin.auth.admin.createUser).toHaveBeenCalledTimes(1);
});
it('keeps normal email enrollment confirmation and uses the server-issued ticket', async () => {
  expect((await call(enroll)).body).toEqual({ uid: 'new', needsEmailConfirmation: true });
  expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: profile.email, email_confirm: false,
    user_metadata: expect.objectContaining({ enrollment_ticket: expect.any(String) }) }));
  expect(mail.send).toHaveBeenCalledWith(profile.email,'','','new');
  expect(client.auth.signUp).not.toHaveBeenCalled();
});
it('blocks inactive accounts even with valid Google credentials', async () => {
  find.mockResolvedValue({ data: { id: 'new', status: 'inactive' } });
  expect((await call({ action: 'google', ...google })).body.error).toContain('inactive');
  expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
});
it('rejects password enrollment under Google-only policy before reserving or creating', async () => {
  policy.mode = 'google_only';
  expect((await call(enroll)).body.error).toContain('verified Google');
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalledWith('rmc_enrollment_reserve', expect.anything());
});
it('accepts verified Google enrollment under Google-only policy', async () => {
  policy.mode = 'google_only';
  expect((await call({ ...enroll, ...google })).body.needsEmailConfirmation).toBe(false);
});
it('bypasses email confirmation only when the server policy permits it', async () => {
  policy.mode = 'bypass';
  const result = await call({ ...enroll, mode: 'required' });
  expect(result.body.session.access_token).toBe('access');
  expect(result.body.needsEmailConfirmation).toBe(false);
  expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }));
  expect(client.auth.resend).not.toHaveBeenCalled();
});
it('ignores a client-supplied bypass request under required policy', async () => {
  expect((await call({ ...enroll, mode: 'bypass' })).body.needsEmailConfirmation).toBe(true);
  expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: false }));
});
it('fails closed if settings are missing', async () => {
  policy = null;
  expect((await call(enroll)).body.error).toContain('settings are unavailable');
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('does not create an account when custom mail is unconfigured', async () => {
  policy.email_kind = 'custom';
  mail.ready=false;
  expect((await call(enroll)).body.error).toContain('not configured');
  expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('keeps saved enrollment recoverable if delivery fails', async () => {
  mail.send.mockRejectedValue(new Error('Queue unavailable'));
  const result = await call(enroll);
  expect(result.body.needsEmailConfirmation).toBe(true);
  expect(result.body.deliveryWarning).toContain('saved');
  expect(result.body.session).toBeUndefined();
});
it('sends an actual custom email and does not expose its verification link', async () => {
  policy.email_kind = 'custom';
  admin.auth.admin.generateLink = vi.fn().mockResolvedValue({ data: { properties: { action_link: 'https://auth.test/secret-link' } } });
  const send = vi.fn().mockResolvedValue(undefined);
  const response = await enrollmentHandler(admin, client, verify, { ready: true, send })(new Request('https://backend.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(enroll) }));
  expect(await response.json()).toEqual({ uid: 'new', needsEmailConfirmation: true });
  expect(send).toHaveBeenCalledWith(profile.email, 'Confirm', 'Welcome', 'new');
  expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
  expect(client.auth.resend).not.toHaveBeenCalled();
});
