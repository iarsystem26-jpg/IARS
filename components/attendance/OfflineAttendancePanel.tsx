import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import { Surface } from '../ui/Page';
import { formatManilaDateTime } from '../../lib/dateTime';
import type { AppEvent } from '../../types';
import { offlineRosterUnavailableReason } from '../../lib/offlineRosterEligibility';
import { offlineQueue, offlineRosters, prepareOfflineAttendance, subscribeOfflineAttendance, syncOfflineAttendance, retryOfflineAttendance, removeSyncedAttendance, type OfflineRoster, type QueuedAttendance } from '../../lib/offlineAttendance';
import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';

export function useOfflineAttendance(owner?: string) {
  const [rosters, setRosters] = useState<OfflineRoster[]>([]);
  const [queue, setQueue] = useState<QueuedAttendance[]>([]);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let disposed = false, request = 0;
    setRosters([]); setQueue([]); setError('');
    const refresh = async (kind?: 'roster' | 'scan' | 'photo') => {
      if (kind === 'photo') return;
      const version = ++request;
      if (!owner) return;
      try {
        const [nextRosters, nextQueue] = await Promise.all([kind === 'scan' ? Promise.resolve(null) : offlineRosters(owner), offlineQueue(owner)]);
        if (!disposed && version === request) { if (nextRosters) setRosters(nextRosters); setQueue(nextQueue); setError(''); }
      } catch (failure) { if (!disposed) setError(errorMessage(failure)); }
    };
    const connection = () => { setOnline(navigator.onLine); void refresh(); };
    const unsubscribe = subscribeOfflineAttendance(kind => void refresh(kind));
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    void refresh();
    return () => { disposed = true; unsubscribe(); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, [owner]);
  return { rosters, queue, error, online };
}

export default function OfflineAttendancePanel({ owner, eventId, event, data }: { owner?: string; eventId?: string; event?: AppEvent; data: ReturnType<typeof useOfflineAttendance> }) {
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setError(''); setNow(Date.now());
    if (!eventId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [eventId]);
  const unavailableReason = event ? offlineRosterUnavailableReason(event, now) : undefined;
  const roster = data.rosters.filter(item => item.event.id === eventId && now + item.clockOffset <= item.captureUntil)
    .sort((a, b) => b.preparedAt - a.preparedAt)[0];
  const rosterTime = now + (roster?.clockOffset || 0);
  const readinessReason = data.error ? 'Offline storage is unavailable. Resolve the storage error before going offline.'
    : unavailableReason || (roster ? offlineRosterUnavailableReason(roster.event, rosterTime) : undefined)
    || (!roster ? 'Download or refresh this event’s roster while online.'
      : rosterTime < roster.preparedAt ? 'Device time has changed. Reconnect and refresh this roster.'
      : rosterTime < roster.event.startTime ? 'Roster saved. Offline capture opens when this event starts.'
      : rosterTime > roster.event.endTime ? 'This event has ended.' : undefined);
  const pending = data.queue.filter(item => item.state === 'pending').length;
  const rejected = data.queue.filter(item => item.state === 'rejected').length;
  const confirmed = data.queue.filter(item => item.state === 'synced').length;
  const act = async (operation: () => Promise<unknown>) => {
    setWorking(true); setError('');
    try { await operation(); } catch (failure) { setError(errorMessage(failure)); }
    finally { setWorking(false); }
  };
  const exportReview = () => {
    const rows = data.queue.map(row => ({ requestId: row.submission.id, event: row.eventTitle, studentId: row.studentId, studentName: row.studentName, direction: row.submission.direction, capturedAt: new Date(row.submission.capturedAt).toISOString(), state: row.state, error: row.error || '', receipt: row.receipt || null }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'attendance-sync-review.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Surface className="space-y-3 p-4" aria-label="Offline attendance">
    <h2 className="font-bold">Offline attendance &amp; roster</h2>
    {data.online && <p className="text-xs text-slate-500">Authorized event rosters refresh automatically while the app is open. Check that this event is saved before going offline.</p>}
    <p role="status" className="text-sm">{data.online ? 'Online' : 'Offline'} · {pending} pending sync · {rejected} need review · {confirmed} confirmed</p>
    {eventId && <>
      <div className={`rounded-xl border p-3 text-sm ${readinessReason ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100'}`} role="status">
        <p className="font-semibold">{readinessReason ? 'Offline attendance is not ready' : 'Ready for offline attendance'}</p>
        <p>{readinessReason || 'This event’s roster is saved on this device. Offline scans remain pending until the server confirms them.'}</p>
        {roster && <p className="mt-1">Last roster refresh: {formatManilaDateTime(roster.preparedAt)}</p>}
        <p className="mt-1">{pending} scans pending sync{rejected ? ` · ${rejected} need review` : ''} across your events.</p>
      </div>
      <p className="text-sm">{roster ? `${roster.students.length} students saved on this device. Prepared ${formatManilaDateTime(roster.preparedAt)}. Capture until ${formatManilaDateTime(roster.captureUntil)}; sync by ${formatManilaDateTime(roster.syncUntil)}.` : 'Download this event’s roster while online before taking offline attendance.'}</p>
      {unavailableReason && <p role="status" className="text-sm text-slate-600">{unavailableReason}</p>}
      <Button variant="secondary" disabled={!owner || !data.online || working || Boolean(unavailableReason)} onClick={() => owner && (!event || !offlineRosterUnavailableReason(event)) && void act(() => prepareOfflineAttendance(owner, eventId))}>{roster ? 'Refresh offline roster' : 'Download offline roster'}</Button>
      <p className="text-xs text-slate-500">Offline lookup uses saved names, student IDs and sections. Present a school ID when a photo is unavailable. Use a prepared printed QR or an exact student ID; a new rotating QR needs internet.</p>
    </>}
    {(data.queue.length > 0) && <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={!owner || !data.online || working || !pending} onClick={() => owner && void act(() => syncOfflineAttendance(owner))}>Sync pending attendance</Button>
      <Button variant="secondary" disabled={working} onClick={exportReview}>Export sync review</Button>
      {confirmed > 0 && <Button variant="secondary" disabled={!owner || working} onClick={() => owner && void act(() => removeSyncedAttendance(owner))}>Clear confirmed from device</Button>}
    </div>}
    {(error || data.error) && <ErrorNotice error={error || data.error} operation="Offline attendance" />}
    {data.queue.some(item => item.state !== 'synced') && <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
      {data.queue.filter(item => item.state !== 'synced').slice(-50).map(row => <li key={row.submission.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <p className="font-semibold">{row.studentName} · {row.studentId} · {row.submission.direction === 'in' ? 'Scan in' : 'Scan out'}</p>
        <p>{row.eventTitle} · {formatManilaDateTime(row.submission.capturedAt)}</p>
        <p>{row.state === 'rejected' ? 'Needs review' : 'Saved on this device — pending server confirmation'}</p>{row.error && <ErrorNotice error={row.error} operation="Sync attendance" />}
        {row.state === 'rejected' && <Button size="sm" variant="secondary" disabled={!data.online || working} onClick={() => owner && void act(() => retryOfflineAttendance(owner, row.submission.id))}>Retry after resolving issue</Button>}
      </li>)}
    </ul>}
    {pending + rejected > 50 && <p className="text-xs text-slate-500">Showing the latest 50 unconfirmed captures. All records remain saved and available in the sync review export.</p>}
    <p className="text-xs text-slate-500">Sync resumes while this app is open. Keep this device’s storage until all records are confirmed. Logging out removes downloaded rosters and keeps pending records for the same account’s next sign-in.</p>
  </Surface>;
}
