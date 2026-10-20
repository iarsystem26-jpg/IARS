import { describe, expect, it } from 'vitest';
import { resolveEmailEncryptionKey, saveEmailEncryptionKey } from '../scripts/email-configuration.mjs';

const key = Buffer.alloc(32, 1).toString('base64');
describe('email encryption configuration', () => {
  it('recovers the installed key instead of rotating queued email encryption', () => {
    expect(resolveEmailEncryptionKey(undefined, { encryptionKey: key })).toBe(key);
    expect(resolveEmailEncryptionKey(key, { encryptionKey: key })).toBe(key);
  });
  it('creates a key for a new installation or uses an operator supplied key', () => {
    expect(Buffer.from(resolveEmailEncryptionKey(undefined, undefined), 'base64')).toHaveLength(32);
    expect(resolveEmailEncryptionKey(key, undefined)).toBe(key);
  });
  it('rejects mismatches and damaged configurations', () => {
    expect(() => resolveEmailEncryptionKey(Buffer.alloc(32, 2).toString('base64'), { encryptionKey: key })).toThrow('does not match');
    expect(() => resolveEmailEncryptionKey('invalid', undefined)).toThrow('32-byte');
    expect(() => resolveEmailEncryptionKey(undefined, {})).toThrow('installed Gmail worker');
  });
  it('preserves other server settings and saves the key only once', () => {
    const source = 'SUPABASE_URL=https://example.supabase.co\n';
    const saved = saveEmailEncryptionKey(source, key);
    expect(saved).toBe(`${source}AUTH_EMAIL_ENCRYPTION_KEY=${key}\n`);
    expect(saveEmailEncryptionKey(saved, key)).toBe(saved);
    expect(saveEmailEncryptionKey('export AUTH_EMAIL_ENCRYPTION_KEY=old\nOTHER=value\n', key)).toBe(`AUTH_EMAIL_ENCRYPTION_KEY=${key}\nOTHER=value\n`);
  });
});
