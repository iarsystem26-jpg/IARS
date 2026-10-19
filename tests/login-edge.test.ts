import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { loginHandler } from '../supabase/functions/_shared/login';

let admin: any, client: any, lookup: any, status: any, filter: any;
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  lookup = vi.fn().mockResolvedValue({ data: null });
  status = vi.fn().mockResolvedValue({ data: { status: 'active' } });
  filter = vi.fn(() => ({ maybeSingle: lookup, single: status }));
  admin = { rpc: vi.fn().mockResolvedValue({ data: 0, error: null }), from: vi.fn(() => ({ select: () => ({ eq: filter }) })) };
  client = { auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials' } }) } };
});
afterEach(() => vi.unstubAllGlobals());

async function login(identifier = ' New@Example.test ') {
  const response = await loginHandler(admin, client)(new Request('https://backend.test', {
    method: 'POST', body: JSON.stringify({ identifier, password: 'Password123!' }),
  }));
  return { status: response.status, body: await response.json() };
}

it('reports a missing email account after a rate-limited credential check', async () => {
  expect(await login()).toMatchObject({ status: 401, body: { code: 'ACCOUNT_NOT_FOUND' } });
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'new@example.test', password: 'Password123!' });
  expect(filter).toHaveBeenCalledWith('profile->>email', 'new@example.test');
});
it('does not suggest signup when an existing account has the wrong password', async () => {
  lookup.mockResolvedValue({ data: { id: 'existing' } });
  expect((await login()).body.code).toBeUndefined();
});
it('does not mistake a lookup failure for a missing account', async () => {
  lookup.mockResolvedValue({ data: null, error: new Error('Unavailable') });
  expect((await login()).body.code).toBeUndefined();
});
it('enforces the attempt limit before checking credentials or looking up accounts', async () => {
  admin.rpc.mockImplementation(async (name: string) => name === 'rmc_edge_rate_limit' ? { data: 0 } : { error: new Error('Limited') });
  expect((await login()).status).toBe(429);
  expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  expect(admin.from).not.toHaveBeenCalled();
});
it('preserves email confirmation errors without a signup prompt', async () => {
  client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('Email not confirmed') });
  expect((await login()).body.error).toContain('Confirm your email');
  expect(admin.from).not.toHaveBeenCalled();
});
it('does not suggest signup when authentication is unavailable', async () => {
  client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'unexpected_failure' } });
  expect((await login()).body.code).toBeUndefined();
  expect(admin.from).not.toHaveBeenCalled();
});
it.each(['active', 'pending'])('allows existing %s accounts to sign in with email', async accountStatus => {
  client.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'existing' }, session: { access_token: 'access', refresh_token: 'refresh' } } });
  status.mockResolvedValue({ data: { status: accountStatus } });
  expect(await login()).toEqual({ status: 200, body: { access_token: 'access', refresh_token: 'refresh' } });
  expect(lookup).not.toHaveBeenCalled();
});
it('retains username sign-in without exposing email-account lookup results', async () => {
  lookup.mockResolvedValue({ data: { profile: { email: 'existing@example.test' } } });
  await login('student');
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'existing@example.test', password: 'Password123!' });
  expect(filter).not.toHaveBeenCalledWith('profile->>email', expect.anything());
});
it('rejects inactive accounts even with valid credentials', async () => {
  client.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'inactive' }, session: { access_token: 'access', refresh_token: 'refresh' } } });
  status.mockResolvedValue({ data: { status: 'inactive' } });
  expect((await login()).status).toBe(401);
});
