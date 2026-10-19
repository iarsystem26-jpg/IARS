import { supabase } from './supabase';

export type Diagnostic = {
  id: string; reporter_id: string | null; source: string; message: string;
  details: string; route: string; occurred_at: string; occurrences: number;
};
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export function triageDiagnostic(message: string): { priority: Priority; summary: string; fix: string } {
  if (/uncaught|unhandled|TypeError|ReferenceError|render.*error/i.test(message) && !/fetch|network|offline|timeout/i.test(message)) return { priority: 'Critical', summary: 'An unexpected error may interrupt the app.', fix: 'Inspect the stack trace and reproduce the failing screen first.' };
  if (/PGRST202|schema cache|function.*not.*found/i.test(message)) return { priority: 'High', summary: 'A required server feature is unavailable.', fix: 'Check that the matching database migration and server version are deployed.' };
  if (/snapshot.*failed|refresh after write|\b5\d{2}\b|database|RPC failed/i.test(message)) return { priority: 'High', summary: 'Loading or saving application data failed.', fix: 'Check the operation, server error code, and database logs; verify whether changes were saved before retrying.' };
  if (/camera|geolocation|NotAllowedError/i.test(message)) return { priority: 'Medium', summary: 'A device permission or capability blocked the action.', fix: 'Check camera/location permissions, HTTPS, and device compatibility.' };
  if (/network|fetch|offline|timeout|connection/i.test(message)) return { priority: 'Medium', summary: 'A connection problem interrupted a request.', fix: 'Check connectivity and retry after reconnecting.' };
  if (/denied|forbidden|permission|jwt|session|auth/i.test(message)) return { priority: 'Medium', summary: 'Access or sign-in verification failed.', fix: 'Check session expiry and the account’s assigned permissions.' };
  if (/invalid|required|duplicate|cancel|already exists/i.test(message)) return { priority: 'Low', summary: 'The action needs corrected input or was cancelled.', fix: 'Review the supplied values and guide the user before retrying.' };
  return { priority: 'Medium', summary: 'An operation reported an error.', fix: 'Review the console details and reproduce the action to identify the cause.' };
}
export const priorityOrder: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** Only collect diagnostic fields; request arguments, profiles and tokens are excluded. */
export function sanitizeDiagnostic(value: string) {
  return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/((?:password|token|secret|key)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/([?&](?:[^=\s]+)=)[^&\s]+/g, '$1[redacted]').slice(0, 6000);
}
function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return ['name', 'message', 'code', 'status', 'errorName', 'errorMessage', 'errorCode', 'errorStatus']
      .filter(k => typeof v[k] === 'string' || typeof v[k] === 'number').map(k => `${k}: ${v[k]}`).join('\n');
  }
  return String(value ?? 'Unknown error');
}
let local: Diagnostic[] = [];
let pending: Diagnostic[] = [];
let installed = false;
let uploading = false;
let reportingError = '';
let reporterId: string | null = null;
const emit = () => window.dispatchEvent(new Event('rmc_diagnostics_update'));
export const getLocalDiagnostics = () => local;
export const getReportingError = () => reportingError;
export async function flushDiagnostics() {
  if (uploading || !pending.length || !navigator.onLine) return;
  uploading = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const batch = pending.filter(row => row.reporter_id === data.session.user.id).slice(0, 20);
    if (!batch.length) return;
    const { error } = await supabase.from('rmc_client_errors').insert(batch.map(({ source, message, details, route, occurrences }) => ({ source, message, details, route, occurrences })));
    if (error) { reportingError = 'Shared error reporting is unavailable. Local console errors are still shown.'; return; }
    pending = pending.filter(row => !batch.includes(row));
    const sent = new Set(batch.map(row => row.id));
    local = local.filter(row => !sent.has(row.id));
    reportingError = '';
    window.dispatchEvent(new Event('rmc_diagnostics_synced'));
  } catch { reportingError = 'Shared error reporting is unavailable. Local console errors are still shown.'; }
  finally { uploading = false; emit(); }
}
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user.id || null;
    if (reporterId !== nextId) { pending = []; local = []; reportingError = ''; }
    reporterId = nextId; emit();
  });
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      const details = sanitizeDiagnostic(args.map(describe).join('\n'));
      const message = details.split('\n').slice(0, 3).join(' ').slice(0, 1000) || 'Unknown console error';
      const route = window.location.hash.split('?')[0].slice(0, 200) || '/';
      const row: Diagnostic = { id: crypto.randomUUID(), reporter_id: null, source: 'console.error', message, details, route, occurred_at: new Date().toISOString(), occurrences: 1 };
      local = [...local.slice(-199), row];
      if (reporterId) pending = [...pending.slice(-199), { ...row, reporter_id: reporterId }];
      emit();
    } catch { /* Diagnostics must never interrupt the application. */ }
  };
  window.setInterval(() => { void flushDiagnostics(); }, 10000);
  window.addEventListener('online', () => { void flushDiagnostics(); });
}
export async function loadSharedDiagnostics(): Promise<Diagnostic[]> {
  const { data, error } = await supabase.from('rmc_client_errors').select('*')
    .gte('occurred_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('occurred_at', { ascending: false }).limit(1000);
  if (error) throw new Error('Shared diagnostics could not be loaded. Check database deployment and your system-health permission.');
  return data || [];
}
export function groupDiagnostics(rows: Diagnostic[]) {
  const groups = new Map<string, Diagnostic & { users: Set<string>; priority: Priority; summary: string; fix: string }>();
  for (const row of rows) {
    const key = `${row.source}:${row.message}:${row.route}`;
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += row.occurrences;
      if (row.reporter_id) existing.users.add(row.reporter_id);
      if (row.occurred_at > existing.occurred_at) { existing.occurred_at = row.occurred_at; existing.details = row.details; }
    } else groups.set(key, { ...row, users: new Set(row.reporter_id ? [row.reporter_id] : []), ...triageDiagnostic(`${row.message}\n${row.details}`) });
  }
  return [...groups.values()].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.users.size - a.users.size || b.occurrences - a.occurrences || b.occurred_at.localeCompare(a.occurred_at));
}
