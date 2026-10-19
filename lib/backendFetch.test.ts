import { afterEach, expect, it, vi } from 'vitest';
import { backendFetch } from './backendFetch';
import { toast, toastStore } from './toast';

afterEach(() => { vi.unstubAllGlobals(); toastStore.getSnapshot().forEach(item => toast.dismiss(item.id)); });
it('does not turn failed diagnostic uploads into new error reports', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
  expect((await backendFetch('https://test.example/rest/v1/rmc_client_errors', { method: 'POST' })).status).toBe(503);
  expect(toastStore.getSnapshot()).toHaveLength(0); expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
it('tracks a request without consuming the SDK response body or exposing query data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: 42 }), { headers: { 'content-type': 'application/json' } })));
  const result = await backendFetch('https://test.example/rest/v1/rmc_profiles?email=secret');
  expect(await result.json()).toEqual({ value: 42 });
  expect(toastStore.getSnapshot()).toHaveLength(0);
  expect(JSON.stringify(toastStore.getSnapshot())).not.toContain('secret');
});
it('reports application errors even when HTTP succeeds', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'permission denied' }), { headers: { 'content-type': 'application/json' } })));
  const response = await backendFetch('https://test.example/functions/v1/rmc-accounts');
  expect(response.ok).toBe(true);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', phase: 2, code: 'ACCESS-001' });
});
it('preserves HTTP errors for SDK handling', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
  expect((await backendFetch('https://test.example/auth/v1/user')).status).toBe(401);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', code: 'AUTH-001' });
});
it('retains network failures at the server-wait phase', async () => {
  const error = new TypeError('Failed to fetch');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(backendFetch('https://test.example/rest/v1/rmc_nodes')).rejects.toBe(error);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', phase: 0, code: 'NET-001' });
});

it('keeps slow account access reads quiet and preserves responses for the table', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const pending = backendFetch('https://test.example/functions/v1/rmc-accounts', { method: 'POST', body: JSON.stringify({ action: 'access', data: {} }) });
    vi.advanceTimersByTime(2000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
    finish(new Response(JSON.stringify({ access: { user: { banned: false } } }), { headers: { 'content-type': 'application/json' } }));
    expect(await (await pending).json()).toEqual({ access: { user: { banned: false } } });
    expect(toastStore.getSnapshot()).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});

it('preserves access-read failures for inline error handling without success toasts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } })));
  const result = await backendFetch('https://test.example/functions/v1/rmc-accounts', { method: 'POST', body: JSON.stringify({ action: 'access' }) });
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual({ error: 'Forbidden' });
  expect(toastStore.getSnapshot()).toHaveLength(0);
});
