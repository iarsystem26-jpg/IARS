import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { rateLimit } from '../supabase/functions/_shared/rateLimit';
import { enrollmentHandler } from '../supabase/functions/_shared/enrollment';
import { loginHandler } from '../supabase/functions/_shared/login';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
const request = () => new Request('https://backend.test', { method: 'POST', body: 'invalid-json', headers: { 'x-forwarded-for': '203.0.113.1' } });
it('returns a retry header and never sends raw IPs to storage', async () => {
  const admin = { rpc: vi.fn().mockResolvedValue({ data: 42 }) };
  const response = await rateLimit(admin, request(), 'login');
  expect(response?.status).toBe(429);
  expect(response?.headers.get('Retry-After')).toBe('42');
  expect(await response?.json()).toMatchObject({ retryAfter: 42 });
  expect(admin.rpc).toHaveBeenCalledWith('rmc_edge_rate_limit', { route_name: 'login', subject_hash: expect.stringMatching(/^[a-f0-9]{64}$/), authenticated_actor: false });
});
it('uses verified account identity independently of IP', async () => {
  const admin = { rpc: vi.fn().mockResolvedValue({ data: 0 }) };
  expect(await rateLimit(admin, request(), 'accounts', 'verified-uid')).toBeNull();
  expect(admin.rpc.mock.calls[0][1].authenticated_actor).toBe(true);
});
it.each([{ error: new Error('Unavailable') }, { data: null }, { data: -1 }, { data: '0' }])('fails closed on a broken counter: %j', async result => {
  const response = await rateLimit({ rpc: async () => result }, request(), 'login');
  expect(response?.status).toBe(503);
});
it('blocks malformed requests before Google verification, lookup, or password authentication', async () => {
  const admin = { rpc: vi.fn().mockResolvedValue({ data: 60 }) };
  const client = { auth: { signInWithPassword: vi.fn() } }; const verify = vi.fn();
  expect((await enrollmentHandler(admin, client, verify)(request())).status).toBe(429);
  expect((await loginHandler(admin, client)(request())).status).toBe(429);
  expect(verify).not.toHaveBeenCalled();
  expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
});
