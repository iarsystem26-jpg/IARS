import type { AppEvent } from '../types';
import { offlineRosters, prepareOfflineAttendance, recentRosterPreparations } from './offlineAttendance';
import { prefetchScannerPhotos } from './scannerPhotos';
import { offlineRosterUnavailableReason } from './offlineRosterEligibility';

export const ROSTER_REFRESH_INTERVAL = 15 * 60 * 1000;
const busy = new Map<string, Promise<void>>();
const retryAfter = new Map<string, number>();

/** Prefetch only scanner events that the server can authorize for offline capture. */
export async function refreshAutomaticRosters(owner: string, events: AppEvent[], isCurrent: () => boolean): Promise<void> {
  if (!navigator.onLine || !globalThis.indexedDB || !isCurrent()) return;
  if (busy.has(owner)) return busy.get(owner);
  const execute = async () => {
    if (!navigator.onLine || !isCurrent()) return;
    const rosters = await offlineRosters(owner);
    for (const roster of rosters.filter((item, index, all) => all.findIndex(candidate => candidate.event.id === item.event.id) === index && Date.now() + item.clockOffset <= item.captureUntil)) void prefetchScannerPhotos(roster, isCurrent).catch(() => {});
    const now = Date.now();
    // Leave capacity below the server's 30/hour limit for manual preparation and other devices.
    const preparedCount = await recentRosterPreparations(owner) ?? rosters.filter(roster => roster.preparedAt - roster.clockOffset > now - 3600000).length;
    let budget = Math.min(2, Math.max(0, 20 - preparedCount));
    const eligible = events.filter(event => !offlineRosterUnavailableReason(event, now));
    const latest = (event: AppEvent) => rosters.find(roster => roster.event.id === event.id);
    const due = eligible.filter(event => {
      const roster = latest(event);
      return (retryAfter.get(`${owner}:${event.id}`) || 0) <= now && (!roster
        || now - (roster.preparedAt - roster.clockOffset) >= ROSTER_REFRESH_INTERVAL);
    }).sort((a, b) => (latest(a)?.preparedAt || 0) - (latest(b)?.preparedAt || 0));
    for (const event of due) {
      if (!budget-- || !navigator.onLine || !isCurrent()) break;
      const retryKey = `${owner}:${event.id}`;
      try {
        const prepared = await prepareOfflineAttendance(owner, event.id, isCurrent);
        void prefetchScannerPhotos(prepared, isCurrent).catch(() => {});
        retryAfter.delete(retryKey);
      } catch (error) {
        if (!isCurrent()) break;
        // Permission and rate-limit failures must not create an RPC loop on every workspace poll.
        retryAfter.set(retryKey, Date.now() + ROSTER_REFRESH_INTERVAL);
        console.warn('Automatic offline roster refresh will retry later.', error instanceof Error ? error.message : 'Preparation unavailable.');
      }
    }
  };
  const run = async () => {
    if (navigator.locks?.request) await navigator.locks.request(`rmc-roster-refresh:${owner}`, execute);
    else await execute();
  };
  const promise = run().finally(() => busy.delete(owner));
  busy.set(owner, promise);
  return promise;
}
