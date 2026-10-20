import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); history.replaceState({}, '', '/'); });
describe('institution backend selection', () => {
  it('loads only published routes and verifies identity before selecting a backend', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://hub.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'hub-public-key');
    history.replaceState({}, '', '/?institution=north-academy');
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ project_ref: 'abcdefghijklmnopqrst', publishable_key: 'target-key' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ config: { slug: 'north-academy', name: 'North Academy' } }] });
    vi.stubGlobal('fetch', fetch);
    const runtime = await import('./institutionRuntime'); await runtime.initializeInstitution();
    expect(runtime.runtimeBackend).toEqual({ url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'target-key' });
    expect(fetch.mock.calls[0][0]).toContain('https://hub.supabase.co/rest/v1/rmc_institution_routes');
    expect(fetch.mock.calls[1][0]).toContain('https://abcdefghijklmnopqrst.supabase.co/rest/v1/rmc_institution_branding');
  });
  it('rejects unknown and mismatched institutions instead of opening the hub', async () => {
    history.replaceState({}, '', '/?institution=unknown-school');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const runtime = await import('./institutionRuntime');
    await expect(runtime.initializeInstitution()).rejects.toThrow('not ready');
  });
  it('does not accept arbitrary backend URLs supplied by the visitor', async () => {
    history.replaceState({}, '', '/?institution=https://evil.example');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const runtime = await import('./institutionRuntime');
    await expect(runtime.initializeInstitution()).rejects.toThrow('Invalid institution'); expect(fetch).not.toHaveBeenCalled();
  });
});
