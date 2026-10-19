export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const IDLE_STORAGE_PREFIX = 'rmc-idle-session:';

type Activity = { sessionId: string; lastActivity: number; expired?: boolean };

// Supabase keeps this claim stable across token refreshes, but changes it on a
// new login. A SIGNED_IN event alone can also mean that a tab regained focus.
export function sessionIdentity(accessToken?: string): string | undefined {
  try {
    const payload = accessToken?.split('.')[1];
    if (!payload) return undefined;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.session_id === 'string' ? claims.session_id : undefined;
  } catch { return undefined; }
}

export function createIdleSession(onExpire: (owner: string) => void) {
  let owner: string | null = null;
  let activity: Activity | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let notified = false;
  const read = (): Activity | undefined => {
    try {
      const saved = JSON.parse(localStorage.getItem(IDLE_STORAGE_PREFIX + owner) || 'null');
      if (saved && typeof saved.sessionId === 'string' && Number.isFinite(saved.lastActivity) && saved.lastActivity > 0) return saved;
    } catch { /* Use the in-memory timer if browser storage is unavailable. */ }
    return undefined;
  };
  const save = () => {
    try { localStorage.setItem(IDLE_STORAGE_PREFIX + owner, JSON.stringify(activity)); } catch { /* In-memory fallback. */ }
  };
  const check = (): boolean => {
    clearTimeout(timer);
    if (!owner || !activity) return true;
    const saved = read();
    if (saved) {
      // A new login in another tab replaces the shared browser session.
      if (saved.sessionId !== activity.sessionId) notified = false;
      activity = saved;
    }
    const remaining = IDLE_TIMEOUT_MS - (Date.now() - activity.lastActivity);
    if (activity.expired || remaining <= 0) {
      activity.expired = true;
      save();
      if (!notified) { notified = true; onExpire(owner); }
      return false;
    }
    timer = setTimeout(check, remaining);
    return true;
  };
  const interact = () => {
    // Check before updating: the first click after a suspended tab wakes must
    // not revive a session that already exceeded its deadline.
    if (document.visibilityState !== 'visible' || !check() || !activity) return;
    if (Date.now() - activity.lastActivity < 1000) return;
    activity.lastActivity = Date.now();
    save();
    check();
  };
  const onStorage = (event: StorageEvent) => {
    if (owner && event.key === IDLE_STORAGE_PREFIX + owner) check();
  };
  const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'];
  events.forEach(event => window.addEventListener(event, interact, { capture: true, passive: true }));
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('storage', onStorage);
  return {
    setSession(nextOwner: string | null, sessionId?: string) {
      if (owner !== nextOwner) { owner = nextOwner; activity = undefined; notified = false; }
      if (!owner) { clearTimeout(timer); return true; }
      const saved = read();
      const id = sessionId || saved?.sessionId || owner;
      if (!activity || activity.sessionId !== id) {
        notified = false;
        activity = saved?.sessionId === id ? saved : { sessionId: id, lastActivity: Date.now() };
        save();
      }
      return check();
    },
    check,
    dispose() {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, interact, true));
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('storage', onStorage);
    },
  };
}
