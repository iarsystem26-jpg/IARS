import { afterEach, describe, expect, it, vi } from 'vitest';
import { educationalUnitConfig } from '../config/educationalUnit';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('educational unit configuration', () => {
  it('defaults to IARS with the supplied assets', () => {
    expect(educationalUnitConfig({})).toMatchObject({ id: 'iars', logoUrl: '/iars-icon.png', primaryColor: '#0066ff' });
  });
  it('customizes institution identity, theme, and installation assets', () => {
    expect(educationalUnitConfig({ VITE_EDUCATIONAL_UNIT_ID: 'north-campus', VITE_INSTITUTION_NAME: 'North Academy', VITE_INSTITUTION_LOGO: '/units/north.png', VITE_INSTITUTION_PRIMARY_COLOR: '#123456', VITE_PWA_ICON_192: '/units/north-192.png' }))
      .toMatchObject({ name: 'North Academy', appName: 'IARS · North Academy', logoUrl: '/units/north.png', primaryColor: '#123456', pwaIcon192: '/units/north-192.png' });
  });
  it.each([
    { VITE_EDUCATIONAL_UNIT_ID: '../another' },
    { VITE_INSTITUTION_PRIMARY_COLOR: 'red; background:url(x)' },
    { VITE_INSTITUTION_LOGO: 'https://external.test/logo.png' },
    { VITE_INSTITUTION_LOGO: '/../../logo.png' },
    { VITE_INSTITUTION_LOGO: '//external.test/logo.png' },
  ])('rejects unsafe public configuration: %j', env => expect(() => educationalUnitConfig(env)).toThrow());
  it('separates sessions and offline storage for different projects even with the same unit ID', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://first.supabase.co');
    const first = await import('./educationalUnit');
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://second.supabase.co');
    const second = await import('./educationalUnit');
    expect(first.unitStorageKey('auth')).not.toEqual(second.unitStorageKey('auth'));
    expect(first.unitStorageKey('offline-attendance-v1')).not.toEqual(second.unitStorageKey('offline-attendance-v1'));
  });
  it('applies unit branding without changing a user’s dark mode preference', async () => {
    vi.stubEnv('VITE_INSTITUTION_PRIMARY_COLOR', '#123456');
    document.documentElement.classList.add('dark');
    const unit = await import('./educationalUnit');
    unit.applyEducationalUnitBranding();
    expect(document.documentElement.style.getPropertyValue('--palette-brand-500')).toBe('18 52 86');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
