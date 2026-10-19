import { supabase } from './supabase';
import { offlinePhoto, offlineRosterEpoch, saveOfflinePhoto, subscribeOfflineAttendance, type OfflineRoster } from './offlineAttendance';

const memory = new Map<string, { src: string; data: string; expiresAt: number }>();
const pending = new Map<string, Promise<string | undefined>>();
const jobs = new Map<string, Promise<void>>();
let generation = 0;
subscribeOfflineAttendance(kind => { if (!kind) { generation++; memory.clear(); } });
const keyFor = (owner: string, uid: string) => `${owner}:${uid}`;
function thumbnail(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d'); if (!context) throw new Error('Photo decoding is unavailable.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/webp', 0.75);
        if (data.length > 180000) throw new Error('Photo thumbnail is too large.');
        resolve(data);
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Profile photo could not be decoded.')); };
    image.src = url;
  });
}
export function cachedScannerPhoto(owner: string, uid: string, src: string): string | undefined {
  const value = memory.get(keyFor(owner, uid));
  return value?.src === src && value.expiresAt > Date.now() ? value.data : undefined;
}
export async function scannerPhoto(roster: OfflineRoster, uid: string, src: string, isCurrent: () => boolean = () => true): Promise<string | undefined> {
  const cached = cachedScannerPhoto(roster.actorUid, uid, src); if (cached) return cached;
  const key = keyFor(roster.actorUid, uid), requestKey = `${key}:${src}`, version = generation;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const run = async () => {
    const epoch = await offlineRosterEpoch(roster.actorUid);
    const active = () => version === generation && isCurrent();
    if (!active()) return undefined;
    let data = await offlinePhoto(roster.actorUid, uid, src, navigator.onLine);
    if (!data && navigator.onLine && active()) {
      const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const { data: blob, error, response } = await supabase.functions.invoke('rmc-scanner-photo', { body: { sessionId: roster.id, studentUid: uid, sourceHash } });
      if (error || !(blob instanceof Blob) || blob.size > 5 * 1024 * 1024 || !active()) return active() ? offlinePhoto(roster.actorUid, uid, src) : undefined;
      const mime = response?.headers.get('X-Rmc-Image-Type');
      if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return undefined;
      data = await thumbnail(new Blob([blob], { type: mime }));
      await saveOfflinePhoto(roster, uid, src, data, epoch, active);
    }
    if (data && active()) {
      memory.set(key, { src, data, expiresAt: Math.min(Date.now() + 15 * 60000, roster.syncUntil - roster.clockOffset) });
      // Keep decoded images bounded; the durable encrypted cache is independent of this limit.
      while (memory.size > 500) memory.delete(memory.keys().next().value!);
      return data;
    }
    return undefined;
  };
  const promise = run().finally(() => pending.delete(requestKey)); pending.set(requestKey, promise); return promise;
}
export function prefetchScannerPhotos(roster: OfflineRoster, isCurrent: () => boolean): Promise<void> {
  if (!navigator.onLine || !isCurrent()) return Promise.resolve();
  if (jobs.has(roster.actorUid)) return jobs.get(roster.actorUid)!;
  const students = roster.students.filter(student => student.photo_url);
  let index = 0;
  const worker = async () => {
    while (index < students.length && navigator.onLine && isCurrent()) {
      const student = students[index++];
      try { await scannerPhoto(roster, student.uid, student.photo_url!, isCurrent); }
      catch { /* Photos never block attendance or consume its durable queue capacity. */ }
    }
  };
  const job = Promise.all([worker(), worker()]).then(() => undefined).finally(() => jobs.delete(roster.actorUid));
  jobs.set(roster.actorUid, job); return job;
}
