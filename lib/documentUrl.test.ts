import { expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ sign: vi.fn(async () => ({ data: { signedUrl: 'https://example.test/photo' }, error: null })) }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: api.sign }) } } }));
import { documentUrl } from './backend';

it.each(['storage://person/photo/avatar.png', 'storage://rmc-documents/person/photo/avatar.png'])('resolves %s in the document bucket', async path => {
  expect(await documentUrl(path)).toBe('https://example.test/photo');
  expect(api.sign).toHaveBeenLastCalledWith('person/photo/avatar.png', 300);
});
