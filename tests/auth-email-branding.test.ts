import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const configure = (values: Record<string, string>) => {
  vi.resetModules();
  vi.stubGlobal('Deno', { env: { get: (key: string) => values[key] } });
  return import('../supabase/functions/_shared/authEmail');
};

it('binds email links, logo, and institution copy to the configured unit', async () => {
  const email = await configure({ IARS_SITE_URL: 'https://north.example.test', IARS_INSTITUTION_NAME: 'North Academy', IARS_INSTITUTION_LOGO: '/units/north/logo.png' });
  const message = email.renderAuthEmail('student@example.test', 'Confirm email', 'Welcome', 'Confirm');
  expect(message.logoUrl).toBe('https://north.example.test/units/north/logo.png');
  expect(message.html).toContain('North Academy');
  expect(message.html).toContain('https://north.example.test/#/privacy-policy');
  expect(message.html).not.toMatch(/rmcssg|iars-blond|RMC/);
});

it('escapes institutional names in emails', async () => {
  const email = await configure({ IARS_SITE_URL: 'https://unit.example.test', IARS_INSTITUTION_NAME: '<script>bad()</script>' });
  const message = email.renderAuthEmail('student@example.test', 'Confirm email', 'Welcome', 'Confirm');
  expect(message.html).not.toContain('<script>');
  expect(message.html).toContain('&lt;script&gt;');
});

it('refuses delivery when a production unit has no website configured', async () => {
  const email = await configure({});
  expect(() => email.renderAuthEmail('student@example.test', 'Confirm email', 'Welcome', 'Confirm')).toThrow('IARS_SITE_URL');
});

it.each(['http://unit.example.test', 'https://user:password@unit.example.test', 'https://unit.example.test/path'])('rejects invalid email website origin %s', async origin => {
  const email = await configure({ IARS_SITE_URL: origin });
  expect(() => email.renderAuthEmail('student@example.test', 'Confirm email', 'Welcome', 'Confirm')).toThrow('HTTPS origin');
});
