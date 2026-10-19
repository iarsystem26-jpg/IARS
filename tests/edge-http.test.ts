import { expect, it } from 'vitest';
import { readJson, responseHeaders } from '../supabase/functions/_shared/http';

it('prevents authentication responses from being cached', () => {
  expect(responseHeaders['Cache-Control']).toBe('no-store');
  expect(responseHeaders['X-Content-Type-Options']).toBe('nosniff');
});
it('parses supported requests and rejects non-object payloads', async () => {
  const request = (body: string) => new Request('https://example.com', { method: 'POST', body });
  expect(await readJson(request('{"action":"create"}'), 100)).toEqual({ action: 'create' });
  for (const value of ['null', '[]', '42', 'invalid']) await expect(readJson(request(value), 100)).rejects.toThrow();
});
it('rejects oversized bodies with or without content-length', async () => {
  const body = JSON.stringify({ identifier: 'a'.repeat(200) });
  for (const headers of [{}, { 'content-length': String(body.length) }]) {
    await expect(readJson(new Request('https://example.com', { method: 'POST', body, headers }), 100)).rejects.toThrow('too large');
  }
});
