import type { AuthEmailMessage } from './authEmail.ts';
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const keyFor = (secret: string) => crypto.subtle.importKey('raw', decode(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function encryptEmail(message: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(secret), new TextEncoder().encode(JSON.stringify(message)));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function decryptEmail<T = AuthEmailMessage>(payload: string, secret: string): Promise<T> {
  const [iv, encrypted] = payload.split('.');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await keyFor(secret), decode(encrypted));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export async function enqueueEmails(admin: any, messages: AuthEmailMessage[], eventId: string, secret: string) {
  const rows = await Promise.all(messages.map(async (message, index) => ({ event_key: `${eventId}:${index}`, payload: await encryptEmail(message,secret) })));
  const result = await admin.from('rmc_auth_email_queue').upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true });
  if (result.error) throw new Error('Unable to queue authentication email.');
}
