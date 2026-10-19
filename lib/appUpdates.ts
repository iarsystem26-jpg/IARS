import { configurationError, supabase } from './supabase';

const revisionKey = 'rmc-app-refresh-revision';
let revision: string | null = null;
let checking = false;
let refreshing = false;
export const isAppRefreshing = () => refreshing;

function storedRevision() { try { return localStorage.getItem(revisionKey); } catch { return null; } }
function rememberRevision(value: string) { try { localStorage.setItem(revisionKey, value); } catch { /* Private browsing may disable storage. */ } }

export async function fetchDeployedVersion(): Promise<string | null> {
  if (import.meta.env.DEV || !navigator.onLine) return null;
  const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data.version === 'string' && data.version.length > 0 ? data.version : null;
}

async function readRevision(): Promise<string | null> {
  if (configurationError) return null;
  // Deliberately public and independent of the visitor's session, including frozen accounts.
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rmc_app_release?id=eq.1&select=revision`;
  const response = await fetch(url, { cache: 'no-store', headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data[0]?.revision === 'string' ? data[0].revision : null;
}

export async function refreshApp(target: string, nextRevision?: string) {
  if (refreshing || !navigator.onLine) return;
  // Prevent a misconfigured CDN from producing an endless reload loop.
  try {
    const last = JSON.parse(sessionStorage.getItem('rmc-last-app-reload') || 'null');
    if (last?.target === target && Date.now() - last.at < 60000) return;
  } catch { /* Storage is optional. */ }
  refreshing = true;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (registration) await registration.unregister();
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith('workbox-') && name.endsWith(`${location.origin}/`)).map(name => caches.delete(name)));
    }
    if (nextRevision) rememberRevision(nextRevision);
    try { sessionStorage.setItem('rmc-last-app-reload', JSON.stringify({ target, at: Date.now() })); } catch { /* Optional loop guard. */ }
    const url = new URL(location.href);
    url.searchParams.set('_app_refresh', `${target}-${Date.now()}`);
    // A new navigation after unregistering bypasses the old worker and HTTP cache.
    location.replace(url.href);
  } catch (error) { refreshing = false; throw error; }
}

export async function checkAppUpdates() {
  if (checking || refreshing || !navigator.onLine) return;
  checking = true;
  try {
    const [deployedResult, revisionResult] = await Promise.allSettled([fetchDeployedVersion(), readRevision()]);
    const deployed = deployedResult.status === 'fulfilled' ? deployedResult.value : null;
    const next = revisionResult.status === 'fulfilled' ? revisionResult.value : null;
    if (revision === null) revision = storedRevision();
    const forced = next !== null && revision !== null && next !== revision;
    if (deployed && (deployed !== __APP_BUILD_VERSION__ || forced)) {
      await refreshApp(forced ? `${deployed}:${next}` : deployed, next || undefined);
    }
    // Keep a missed forced refresh pending if the deployment endpoint is unavailable.
    if (next && !refreshing && (!forced || deployed)) { revision = next; rememberRevision(next); }
  } finally { checking = false; }
}

export function watchAppUpdates() {
  const check = () => { void checkAppUpdates().catch(() => { /* Retry at the next reconnect or interval. */ }); };
  const visible = () => { if (document.visibilityState === 'visible') check(); };
  const timer = window.setInterval(visible, 60000);
  window.addEventListener('online', check);
  window.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  // Subscribe first, then read: this closes the gap between startup and subscription.
  const channel = configurationError ? null : supabase.channel('app-release')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rmc_app_release' }, check)
    .subscribe(status => { if (status === 'SUBSCRIBED') check(); });
  check();
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('online', check);
    window.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
    if (channel) void supabase.removeChannel(channel);
  };
}
