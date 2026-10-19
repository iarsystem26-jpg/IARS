import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createIdleSession, IDLE_STORAGE_PREFIX, IDLE_TIMEOUT_MS, sessionIdentity } from './idleSession';

let guard: ReturnType<typeof createIdleSession>;
let expire = vi.fn<(owner: string) => void>();
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T08:00:00Z'));
  expire = vi.fn();
  guard = createIdleSession(expire);
});
afterEach(() => { guard.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

it('expires once after 15 minutes without interaction', () => {
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
  expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expire).toHaveBeenCalledExactlyOnceWith('student');
  guard.check();
  expect(expire).toHaveBeenCalledOnce();
});

it.each(['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'])('extends the deadline on %s', event => {
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(10 * 60 * 1000);
  window.dispatchEvent(new Event(event));
  vi.advanceTimersByTime(10 * 60 * 1000);
  expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5 * 60 * 1000);
  expect(expire).toHaveBeenCalledOnce();
});

it('does not extend the deadline on auth events or focus', () => {
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(10 * 60 * 1000);
  guard.setSession('student', 'session-a');
  window.dispatchEvent(new Event('focus'));
  vi.advanceTimersByTime(5 * 60 * 1000);
  expect(expire).toHaveBeenCalledOnce();
});

it('rejects an expired saved session on reopening and allows a new login', () => {
  guard.setSession('student', 'session-a');
  guard.dispose();
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS);
  guard = createIdleSession(expire);
  expect(guard.setSession('student', 'session-a')).toBe(false);
  expect(expire).toHaveBeenCalledOnce();
  expect(guard.setSession('student', 'session-b')).toBe(true);
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
  expect(expire).toHaveBeenCalledOnce();
});

it.each(['pointerdown', 'focus', 'pageshow', 'visibilitychange'])('checks the elapsed wall clock before handling %s after suspension', event => {
  guard.setSession('student', 'session-a');
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS + 1);
  (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
  expect(expire).toHaveBeenCalledOnce();
});

it('shares activity across tabs and honors logout markers from another tab', () => {
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(10 * 60 * 1000);
  const key = IDLE_STORAGE_PREFIX + 'student';
  localStorage.setItem(key, JSON.stringify({ sessionId: 'session-a', lastActivity: Date.now() }));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  vi.advanceTimersByTime(10 * 60 * 1000);
  expect(expire).not.toHaveBeenCalled();
  localStorage.setItem(key, JSON.stringify({ sessionId: 'session-a', lastActivity: Date.now(), expired: true }));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  expect(expire).toHaveBeenCalledOnce();
});

it('does not count hidden-tab events as activity', () => {
  guard.setSession('student', 'session-a');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  vi.advanceTimersByTime(10 * 60 * 1000);
  window.dispatchEvent(new Event('pointermove'));
  vi.advanceTimersByTime(5 * 60 * 1000);
  expect(expire).toHaveBeenCalledOnce();
});

it('does not let an old tab overwrite a fresh login in another tab', () => {
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(10 * 60 * 1000);
  const key = IDLE_STORAGE_PREFIX + 'student';
  localStorage.setItem(key, JSON.stringify({ sessionId: 'session-b', lastActivity: Date.now() }));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  vi.advanceTimersByTime(5 * 60 * 1000);
  expect(expire).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(key)!).sessionId).toBe('session-b');
  vi.advanceTimersByTime(10 * 60 * 1000);
  expect(expire).toHaveBeenCalledOnce();
});

it('still expires when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  guard.setSession('student', 'session-a');
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
  expect(expire).toHaveBeenCalledOnce();
});

it('stops monitoring signed-out sessions and removes listeners on dispose', () => {
  guard.setSession('student', 'session-a');
  guard.setSession(null);
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
  expect(expire).not.toHaveBeenCalled();
  guard.setSession('another', 'session-b');
  guard.dispose();
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS);
  window.dispatchEvent(new Event('focus'));
  expect(expire).not.toHaveBeenCalled();
});

it('extracts the stable session identity from refreshed access tokens', () => {
  const token = (expiry: number) => `header.${btoa(JSON.stringify({ session_id: 'session-a', exp: expiry }))}.signature`;
  expect(sessionIdentity(token(1))).toBe('session-a');
  expect(sessionIdentity(token(2))).toBe('session-a');
  expect(sessionIdentity('invalid')).toBeUndefined();
});
