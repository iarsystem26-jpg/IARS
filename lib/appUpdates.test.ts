import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetch: vi.fn(), unregister: vi.fn(), remove: vi.fn(), replace: vi.fn() }));
vi.mock('./supabase', () => ({ configurationError: null, supabase: {} }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear();
  vi.stubEnv('DEV', false); vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubGlobal('fetch', api.fetch);
  vi.stubGlobal('location', { href: 'https://app.example/?existing=1#/login', origin: 'https://app.example', replace: api.replace });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: vi.fn().mockResolvedValue({ unregister: api.unregister }) }, configurable: true });
  vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['workbox-precache-v2-https://app.example/', 'attendance-queue', 'workbox-precache-v2-https://other.example/']), delete: api.remove });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function responses(version: string | null, revision = 'revision-1') {
  api.fetch.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.startsWith('/version.json') ? { version } : [{ revision }] }));
}
it('refreshes a stale build before mounting, preserving route, session storage and attendance caches', async () => {
  responses('new-deployment'); localStorage.setItem('auth-session', 'preserved');
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  expect(api.unregister).toHaveBeenCalledTimes(1);
  expect(api.remove).toHaveBeenCalledExactlyOnceWith('workbox-precache-v2-https://app.example/');
  const url = new URL(api.replace.mock.calls[0][0]);
  expect(url.hash).toBe('#/login'); expect(url.searchParams.get('existing')).toBe('1');
  expect(url.searchParams.has('_app_refresh')).toBe(true);
  expect(localStorage.getItem('auth-session')).toBe('preserved');
});
it('forces a logged-out browser to refresh even when the deployed build did not change', async () => {
  localStorage.setItem('rmc-app-refresh-revision', 'old-revision'); responses(__APP_BUILD_VERSION__, 'new-revision');
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  expect(api.replace).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('rmc-app-refresh-revision')).toBe('new-revision');
  const request = api.fetch.mock.calls.find(([url]) => url.includes('/rest/'));
  expect(request?.[1].headers).toEqual({ apikey: 'sb_publishable_test' });
});
it('does not reload a current build on first visit or repeated checks', async () => {
  responses(__APP_BUILD_VERSION__);
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates(); await checkAppUpdates();
  expect(api.replace).not.toHaveBeenCalled();
});
it('uses the tab baseline so another tab cannot suppress a realtime refresh', async () => {
  responses(__APP_BUILD_VERSION__);
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  localStorage.setItem('rmc-app-refresh-revision', 'revision-2'); responses(__APP_BUILD_VERSION__, 'revision-2');
  await checkAppUpdates(); expect(api.replace).toHaveBeenCalledTimes(1);
});
it('keeps offline clients usable and retries when they reconnect', async () => {
  responses('new-deployment');
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  expect(api.fetch).not.toHaveBeenCalled(); expect(api.unregister).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await checkAppUpdates(); expect(api.replace).toHaveBeenCalledTimes(1);
});
it('does not destroy offline assets if deployment verification fails', async () => {
  responses(null, 'new-revision'); localStorage.setItem('rmc-app-refresh-revision', 'old-revision');
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  expect(api.unregister).not.toHaveBeenCalled(); expect(api.remove).not.toHaveBeenCalled();
  expect(localStorage.getItem('rmc-app-refresh-revision')).toBe('old-revision');
});
it('prevents rapid reload loops when the host continues serving a stale build', async () => {
  responses('new-deployment');
  sessionStorage.setItem('rmc-last-app-reload', JSON.stringify({ target: 'new-deployment', at: Date.now() }));
  const { checkAppUpdates } = await import('./appUpdates'); await checkAppUpdates();
  expect(api.replace).not.toHaveBeenCalled(); expect(api.unregister).not.toHaveBeenCalled();
});
