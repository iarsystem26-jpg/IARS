import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), list: vi.fn(), remove: vi.fn() }));
vi.mock('./supabase', () => ({ requireConfiguration: () => {}, supabase: { auth: { signInWithPasskey: api.login, registerPasskey: api.register, passkey: { list: api.list, delete: api.remove } } } }));
import { listPasskeys, passkeyErrorMessage, passkeyUnavailableReason, registerPasskey, removePasskey, signInWithPasskey } from './passkeys';
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('VITE_PASSKEY_RP_ID', '');
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('PublicKeyCredential', class {});
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create: vi.fn(), get: vi.fn() } });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses the Supabase session created by verified passkey authentication', async () => {
  const data = { session: { access_token: 'verified-token' }, user: { id: 'student' } };
  api.login.mockResolvedValue({ data, error: null });
  const controller = new AbortController();
  await expect(signInWithPasskey(controller.signal)).resolves.toEqual(data);
  expect(api.login).toHaveBeenCalledWith({ options: { signal: controller.signal } });
});
it('does not report login success for missing sessions or verification errors', async () => {
  api.login.mockResolvedValue({ data: { session: null, user: null }, error: null });
  await expect(signInWithPasskey()).rejects.toThrow('No login session');
  const error = { code: 'webauthn_verification_failed', message: 'Invalid assertion' };
  api.login.mockResolvedValue({ data: null, error });
  await expect(signInWithPasskey()).rejects.toEqual(error);
});
it.each(['insecure', 'unsupported', 'offline', 'wrong-domain'])('blocks %s requests before calling Auth', async kind => {
  if (kind === 'insecure') vi.stubGlobal('isSecureContext', false);
  if (kind === 'unsupported') vi.stubGlobal('PublicKeyCredential', undefined);
  if (kind === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  if (kind === 'wrong-domain') vi.stubEnv('VITE_PASSKEY_RP_ID', 'rmcssg.vercel.app');
  await expect(signInWithPasskey()).rejects.toThrow();
  await expect(registerPasskey()).rejects.toThrow();
  expect(api.login).not.toHaveBeenCalled(); expect(api.register).not.toHaveBeenCalled();
});
it('registers only through Supabase and propagates an enrollment rejection', async () => {
  const passkey = { id: 'key', created_at: '2026-10-08T00:00:00Z' };
  api.register.mockResolvedValue({ data: passkey, error: null });
  await expect(registerPasskey()).resolves.toEqual(passkey);
  const error = { code: 'email_not_confirmed' }; api.register.mockResolvedValue({ data: null, error });
  await expect(registerPasskey()).rejects.toEqual(error);
});
it('allows listing and revoking credentials even on a browser without WebAuthn', async () => {
  vi.stubGlobal('PublicKeyCredential', undefined);
  api.list.mockResolvedValue({ data: [{ id: 'key' }], error: null }); api.remove.mockResolvedValue({ error: null });
  await expect(listPasskeys()).resolves.toEqual([{ id: 'key' }]); await removePasskey('key');
  expect(api.remove).toHaveBeenCalledWith({ passkeyId: 'key' });
  api.remove.mockResolvedValue({ error: new Error('Access denied') });
  await expect(removePasskey('key')).rejects.toThrow('Access denied');
});
it('explains cancellation, expired challenges, and unsupported browsers', () => {
  expect(passkeyErrorMessage({ name: 'NotAllowedError' })).toContain('cancelled');
  expect(passkeyErrorMessage({ code: 'webauthn_challenge_expired' })).toContain('expired');
  expect(passkeyErrorMessage({ message: 'Credential verification failed' })).toContain('sign in with your password or Google');
  expect(passkeyUnavailableReason()).toBeNull();
});
