import { describe, expect, it } from 'vitest';
import { securityHeaders, validatePublicEnvironment } from '../security.config.mjs';

describe('public environment safety', () => {
  it.each(['VITE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SECRET_KEY', 'VITE_DATABASE_URL', 'VITE_ADMIN_PASSWORD'])('rejects %s before bundling', name => {
    expect(() => validatePublicEnvironment({ [name]: 'must-stay-server-side' })).toThrow('must not be exposed');
  });
  it('rejects privileged keys even under the publishable key name', () => {
    const privilegedJwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    for (const key of ['sb_secret_test', privilegedJwt]) expect(() => validatePublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow('privileged key');
    expect(() => validatePublicEnvironment({ VITE_PUBLIC_KEY: 'sb_secret_test' })).toThrow('privileged key');
  });
  it('accepts publishable and legacy anon keys', () => {
    const anonJwt = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
    for (const key of ['sb_publishable_test', anonJwt]) expect(() => validatePublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: key })).not.toThrow();
  });
  it('requires HTTPS for remote backends', () => {
    expect(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'http://remote.example' })).toThrow('HTTPS');
    expect(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'ftp://localhost' })).toThrow('HTTPS');
    expect(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'https://user:password@project.supabase.co' })).toThrow('HTTPS');
    expect(() => validatePublicEnvironment({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).not.toThrow();
  });
});

it('blocks script injection and framing while permitting camera, GPS, maps, image uploads, and Supabase', () => {
  const headers = securityHeaders({ VITE_SUPABASE_URL: 'https://project.supabase.co' });
  const csp = headers['Content-Security-Policy'];
  expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client;");
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('https://project.supabase.co wss://project.supabase.co');
  expect(csp).toContain('https://script.googleusercontent.com');
  expect(csp).toContain('https://*.tile.openstreetmap.org');
  expect(csp.split('; ').find(value => value.startsWith('img-src'))).toContain('https://project.supabase.co');
  expect(csp.split('; ').find(value => value.startsWith('frame-src'))).toContain('https://www.google.com');
  expect(headers['Permissions-Policy']).toContain('camera=(self), geolocation=(self)');
  expect(headers['X-Content-Type-Options']).toBe('nosniff');
});
