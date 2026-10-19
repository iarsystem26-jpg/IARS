export const NAVIGATION_PREFIX = 'rmc:navigation:v1:';

// Only browsing destinations belong in return history. Forms and auth flows
// still survive a refresh through their URL, but Back never reopens them.
export function isReturnDestination(url: string): boolean {
  const path = url.split('?')[0];
  if (/^\/ossa\/dashboard\/(activities|requests|sanctions|clearance|excuses|analytics|organizations)$/.test(path)) return true;
  if (/^\/(dashboard|student\/(qr|events|ceremonies|records|profile)|mayor\/scan|ssg\/(panel|events)|admin\/(attendance|controls)|ossa\/dashboard|organizations)$/.test(path)) return true;
  if (/\/(create|edit|public)$/.test(path)) return false;
  if (/^\/ssg\/panel\/students\/[a-z0-9_-]+$/i.test(path)) return true;
  return /^\/(student|ssg)\/events\/[a-z0-9_-]+$/i.test(path)
    || /^\/organizations\/[a-z0-9_-]+(\/events\/[a-z0-9_-]+)?$/i.test(path);
}

export function readMemory<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(NAVIGATION_PREFIX + key) || 'null') ?? fallback; }
  catch { return fallback; }
}

export function writeMemory(key: string, value: unknown) {
  try { sessionStorage.setItem(NAVIGATION_PREFIX + key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}

export function clearNavigationMemory() {
  try {
    Object.keys(sessionStorage).filter(key => key.startsWith(NAVIGATION_PREFIX)).forEach(key => sessionStorage.removeItem(key));
  } catch { /* Navigation still works without storage. */ }
}

export function readReturnHistory(owner: string): string[] {
  const saved = readMemory<unknown>(owner + ':history', []);
  return Array.isArray(saved) ? saved.filter((url): url is string => typeof url === 'string' && isReturnDestination(url)).slice(-40) : [];
}

export function lastDestination(owner: string, fallback = '/dashboard') {
  return readReturnHistory(owner).at(-1) || fallback;
}

export function signInDestination(owner: string, role: string | undefined, state: unknown): string {
  const fallback = role === 'ossa' || role === 'ossa_staff' ? '/ossa/dashboard' : '/dashboard';
  const redirect = state as { returnTo?: unknown; returnToOwner?: unknown } | null;
  if (typeof redirect?.returnTo === 'string' && redirect.returnTo.startsWith('/') && !redirect.returnTo.startsWith('//')
    && (!redirect.returnToOwner || redirect.returnToOwner === owner)) return redirect.returnTo;
  // A different account must start in its own workspace.
  if (redirect?.returnToOwner && redirect.returnToOwner !== owner) return fallback;
  return lastDestination(owner, fallback);
}
