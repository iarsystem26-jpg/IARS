import { supabase } from './supabase';
import { unitStorageKey } from './educationalUnit';
import type { AppEvent, UserProfile } from '../types';
import { getDistanceFromLatLonInMeters } from './geolocation';

export type OfflineStudent = Pick<UserProfile, 'uid' | 'name' | 'student_id' | 'role' | 'account_status' | 'school_data'> & Partial<Pick<UserProfile, 'photo_url'>>;
export type OfflineRoster = {
  id: string; actorUid: string; actor: OfflineStudent; event: AppEvent;
  preparedAt: number; captureUntil: number; syncUntil: number;
  students: OfflineStudent[]; qrHashes: { studentUid: string; hash: string; expiresAt: number | null }[];
  clockOffset: number;
};
export type AttendanceSubmission = {
  id: string; sessionId: string; studentUid: string; direction: 'in' | 'out'; capturedAt: number;
  qrToken: string | null; manualReason: string;
  position: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null;
};
export type QueuedAttendance = {
  submission: AttendanceSubmission; actorUid: string; studentName: string; studentId: string; eventTitle: string;
  state: 'pending' | 'rejected' | 'synced'; attempts: number; error?: string; receipt?: Record<string, any>;
};
type Stored = { id: string; owner: string; kind: 'roster' | 'scan' | 'photo'; state?: QueuedAttendance['state']; eventId?: string; preparedAt?: number; iv: Uint8Array; cipher: ArrayBuffer };
const DB_NAME = unitStorageKey('offline-attendance-v1');
const CHANGE = unitStorageKey('offline-attendance');
let dbPromise: Promise<IDBDatabase> | undefined;
const busy = new Map<string, Promise<void>>();
const syncAgain = new Set<string>();
const rosterMemory = new Map<string, { roster: OfflineRoster; epoch: number }>();
const queueMemory = new Map<string, Map<string, QueuedAttendance>>();
const queueVersion = new Map<string, number>();
const metadataReady = new Set<string>();
const notify = (kind?: Stored['kind']) => window.dispatchEvent(new CustomEvent(CHANGE, { detail: kind }));
export const subscribeOfflineAttendance = (listener: (kind?: Stored['kind']) => void) => {
  const handler = (event: Event) => listener((event as CustomEvent).detail);
  window.addEventListener(CHANGE, handler);
  return () => window.removeEventListener(CHANGE, handler);
};
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANGE) : null;
function invalidate(kind?: Stored['kind'], owner?: string, external = false) {
  if (!kind || kind === 'roster') for (const [id, entry] of rosterMemory) if (!owner || entry.roster.actorUid === owner) rosterMemory.delete(id);
  if (!kind || (external && kind === 'scan')) {
    if (owner) queueMemory.delete(owner); else queueMemory.clear();
  }
  if (owner) queueVersion.set(owner, (queueVersion.get(owner) || 0) + 1);
}
channel?.addEventListener('message', event => {
  const { kind, owner } = typeof event.data === 'object' && event.data ? event.data : {};
  invalidate(kind, owner, true); notify(kind);
});
function changed(kind?: Stored['kind'], owner?: string) { invalidate(kind, owner); notify(kind); channel?.postMessage({ kind, owner }); }

function database() {
  if (!globalThis.indexedDB || !crypto.subtle) return Promise.reject(new Error('Offline storage is unavailable. Use a supported browser with storage enabled.'));
  if (!dbPromise) dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('keys')) request.result.createObjectStore('keys');
      const records = request.result.objectStoreNames.contains('records') ? request.transaction!.objectStore('records') : request.result.createObjectStore('records', { keyPath: 'id' });
      if (!records.indexNames.contains('owner')) records.createIndex('owner', 'owner');
      records.createIndex('ownerKind', ['owner', 'kind']);
      records.createIndex('ownerState', ['owner', 'kind', 'state']);
    };
    request.onerror = () => reject(new Error('Offline storage could not be opened. Check browser storage permissions.'));
    request.onblocked = () => reject(new Error('Close other app tabs to finish offline storage setup.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; };
      resolve(request.result);
    };
  }).catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}
async function transaction<T>(store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('Attendance could not be saved on this device. Free storage space and retry; keep this page open.'));
  });
}
async function key(owner: string) {
  const existing = await transaction<CryptoKey | undefined>('keys', 'readonly', store => store.get(owner));
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // Read and insert in one transaction so two tabs cannot replace each other's key.
  const db = await database();
  return new Promise<CryptoKey>((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite'), store = tx.objectStore('keys');
    let result = created;
    const request = store.get(owner);
    request.onsuccess = () => { if (request.result) result = request.result; else store.put(created, owner); };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(new Error('Offline encryption setup failed.'));
  });
}
async function encryptedRecord(owner: string, kind: Stored['kind'], id: string, value: unknown): Promise<Stored> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${owner}:${kind}:${id}`);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, await key(owner), new TextEncoder().encode(JSON.stringify(value)));
  return { id, owner, kind, iv, cipher };
}
async function save(owner: string, kind: Stored['kind'], id: string, value: unknown) {
  const record = await encryptedRecord(owner, kind, id, value);
  if (kind === 'scan') record.state = (value as QueuedAttendance).state;
  await transaction('records', 'readwrite', store => store.put(record));
  if (kind === 'scan') queueMemory.get(owner)?.set(id, value as QueuedAttendance);
  changed(kind, owner);
}
const rosterEpochKey = (owner: string) => `roster-epoch:${owner}`;
async function rosterEpoch(owner: string) {
  return (await transaction<number | undefined>('keys', 'readonly', store => store.get(rosterEpochKey(owner)))) || 0;
}
async function saveRoster(roster: OfflineRoster, epoch: number, isCurrent: () => boolean = () => true, newGrant = false) {
  const record = await encryptedRecord(roster.actorUid, 'roster', roster.id, roster);
  record.eventId = roster.event.id; record.preparedAt = roster.preparedAt;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['keys', 'records'], 'readwrite'), keys = tx.objectStore('keys');
    const request = keys.get(rosterEpochKey(roster.actorUid));
    let cancelled = false;
    request.onsuccess = () => {
      // This check and the write share a transaction with logout cleanup, including across tabs.
      if ((request.result || 0) !== epoch || !isCurrent()) { cancelled = true; tx.abort(); return; }
      tx.objectStore('records').put(record);
      keys.put(roster.actorUid, 'active-owner');
      if (newGrant) {
        const historyKey = `roster-preparations:${roster.actorUid}`, history = keys.get(historyKey);
        history.onsuccess = () => keys.put([...(history.result || []).filter((time: number) => time > Date.now() - 3600000), Date.now()], historyKey);
        const records = tx.objectStore('records'), rows = records.index('ownerKind').getAll([roster.actorUid, 'roster']);
        rows.onsuccess = () => {
          const sameEvent = (rows.result as Stored[]).filter(row => row.eventId === roster.event.id).sort((a, b) => (b.preparedAt || 0) - (a.preparedAt || 0));
          // Queued submissions retain their immutable server grant IDs; syncing does not require an old local roster.
          for (const previous of sameEvent.slice(2)) records.delete(previous.id);
        };
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error(cancelled ? 'The account changed or signed out. Roster preparation was cancelled.' : 'The encrypted roster could not be saved. Check browser storage permissions.'));
  });
  changed('roster', roster.actorUid);
  rosterMemory.set(roster.id, { roster, epoch });
}
async function decrypt<T>(row: Stored): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as BufferSource, additionalData: new TextEncoder().encode(`${row.owner}:${row.kind}:${row.id}`) }, await key(row.owner), row.cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
async function read<T>(owner: string, kind: Stored['kind']): Promise<T[]> {
  const rows = await transaction<Stored[]>('records', 'readonly', store => store.index('ownerKind').getAll([owner, kind]));
  const encryptionKey = rows.length ? await key(owner) : null;
  return Promise.all(rows.filter(row => row.kind === kind).map(async row => {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as BufferSource, additionalData: new TextEncoder().encode(`${owner}:${kind}:${row.id}`) }, encryptionKey!, row.cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }));
}
export async function offlineRosters(owner: string): Promise<OfflineRoster[]> {
  if (!globalThis.indexedDB) return [];
  const epoch = await rosterEpoch(owner);
  const rosters = (await read<OfflineRoster>(owner, 'roster')).sort((a, b) => b.preparedAt - a.preparedAt);
  for (const roster of rosters.slice(0, 32)) rosterMemory.set(roster.id, { roster, epoch });
  while (rosterMemory.size > 32) rosterMemory.delete(rosterMemory.keys().next().value!);
  return rosters;
}
const sortQueue = (rows: QueuedAttendance[]) => rows.sort((a, b) => a.submission.capturedAt - b.submission.capturedAt || (a.submission.direction === b.submission.direction ? 0 : a.submission.direction === 'in' ? -1 : 1) || a.submission.id.localeCompare(b.submission.id));
export async function offlineQueue(owner: string): Promise<QueuedAttendance[]> {
  if (!globalThis.indexedDB) return [];
  if (queueMemory.has(owner)) return sortQueue([...queueMemory.get(owner)!.values()]);
  const version = queueVersion.get(owner) || 0;
  const rows = await read<QueuedAttendance>(owner, 'scan');
  if (version !== (queueVersion.get(owner) || 0)) return offlineQueue(owner);
  queueMemory.set(owner, new Map(rows.map(row => [row.submission.id, row])));
  return sortQueue(rows);
}
export async function currentOfflineRoster(owner: string, id: string): Promise<OfflineRoster | undefined> {
  const epoch = await rosterEpoch(owner);
  const cached = rosterMemory.get(id);
  if (cached?.roster.actorUid === owner && cached.epoch === epoch) {
    if (await transaction('records', 'readonly', store => store.getKey(id))) return cached.roster;
    rosterMemory.delete(id); return undefined;
  }
  const row = await transaction<Stored | undefined>('records', 'readonly', store => store.get(id));
  if (!row || row.owner !== owner || row.kind !== 'roster') return undefined;
  const roster = await decrypt<OfflineRoster>(row);
  rosterMemory.set(id, { roster, epoch }); return roster;
}
export async function restoreOfflineScanner(owner: string) {
  const rosters = await offlineRosters(owner);
  return rosters.find(roster => Date.now() + roster.clockOffset <= roster.syncUntil);
}
export async function restoreActiveOfflineScanner() {
  if (!globalThis.indexedDB) return undefined;
  const owner = await transaction<string | undefined>('keys', 'readonly', store => store.get('active-owner'));
  return owner ? restoreOfflineScanner(owner) : undefined;
}
export async function prepareOfflineAttendance(owner: string, eventId: string, isCurrent: () => boolean = () => true): Promise<OfflineRoster> {
  if (!navigator.onLine) throw new Error('Connect to download an authorized event roster first.');
  await database(); // Fail before issuing a grant if durable storage is unavailable.
  const epoch = await rosterEpoch(owner);
  const session = await supabase.auth.getSession();
  if (!isCurrent() || session.error || session.data.session?.user.id !== owner) throw new Error('Sign in again before preparing an offline roster.');
  const started = Date.now();
  const { data, error } = await supabase.rpc('rmc_prepare_offline_attendance', { target_event_id: eventId });
  if (error) throw error;
  if (!data || data.actorUid !== owner) throw new Error('The account changed. Sign in again before preparing.');
  const clockOffset = data.preparedAt - (started + Date.now()) / 2;
  if (Math.abs(clockOffset) > 60000) throw new Error('Set this device to automatic date and time, then prepare the roster again.');
  const roster: OfflineRoster = { ...data, clockOffset };
  const currentSession = await supabase.auth.getSession();
  if (currentSession.error || currentSession.data.session?.user.id !== owner) throw new Error('The account changed. Roster preparation was cancelled.');
  await saveRoster(roster, epoch, isCurrent, true);
  // Best effort only: a denied persistence request must not masquerade as a failed save.
  await navigator.storage?.persist?.().catch(() => false);
  return roster;
}
export async function recentRosterPreparations(owner: string): Promise<number | undefined> {
  const history = await transaction<number[] | undefined>('keys', 'readonly', store => store.get(`roster-preparations:${owner}`));
  return history?.filter(time => time > Date.now() - 3600000).length;
}
const profileRefreshes = new Map<string, Promise<void>>();
export async function refreshCachedRosterProfiles(owner: string, profiles: OfflineStudent[], isCurrent: () => boolean): Promise<void> {
  if (!isCurrent() || !navigator.onLine || !globalThis.indexedDB) return;
  if (profileRefreshes.has(owner)) return profileRefreshes.get(owner);
  const run = async () => {
    const fresh = new Map(profiles.map(profile => [profile.uid, profile]));
    const latest = new Map<string, OfflineRoster>();
    for (const { roster } of rosterMemory.values()) if (roster.actorUid === owner && (!latest.has(roster.event.id) || latest.get(roster.event.id)!.preparedAt < roster.preparedAt)) latest.set(roster.event.id, roster);
    const epoch = await rosterEpoch(owner);
    for (const roster of latest.values()) {
      if (!isCurrent()) break;
      const current = await currentOfflineRoster(owner, roster.id); if (!current) continue;
      let updated = false;
      const students = current.students.map(student => {
        const profile = fresh.get(student.uid); if (!profile || profile.account_status !== 'active') return student;
        const next: OfflineStudent = { uid: profile.uid, name: profile.name, student_id: profile.student_id, role: profile.role, account_status: profile.account_status, photo_url: profile.photo_url || '', school_data: { type: profile.school_data.type, level: profile.school_data.level, section: profile.school_data.section } };
        const same = student.name === next.name && student.student_id === next.student_id && student.role === next.role && (student.photo_url || '') === next.photo_url
          && ['type', 'level', 'section'].every(field => (student.school_data as any)[field] === (next.school_data as any)[field]);
        if (same) return student; updated = true; return next;
      });
      // Snapshot fields update existing identities only. New membership and QR hashes require the authorization RPC.
      if (updated) await saveRoster({ ...current, students }, epoch, isCurrent);
    }
  };
  const promise = run().finally(() => profileRefreshes.delete(owner)); profileRefreshes.set(owner, promise); return promise;
}
export function rosterStudent(roster: OfflineRoster, studentId: string) {
  return rosterIndex(roster).ids.get(studentId.trim().toLowerCase());
}
const indexes = new WeakMap<OfflineRoster, { ids: Map<string, OfflineStudent>; uids: Map<string, OfflineStudent>; hashes: Map<string, OfflineRoster['qrHashes'][number]> }>();
function rosterIndex(roster: OfflineRoster) {
  let index = indexes.get(roster);
  if (!index) {
    index = { ids: new Map(roster.students.map(student => [student.student_id.trim().toLowerCase(), student])), uids: new Map(roster.students.map(student => [student.uid, student])), hashes: new Map(roster.qrHashes.map(pass => [pass.hash, pass])) };
    indexes.set(roster, index);
  }
  return index;
}
export async function rosterQrStudent(roster: OfflineRoster, token: string) {
  if (!/^RMC1:[0-9a-f]{64}$/.test(token)) throw new Error('Invalid QR code.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.slice(5))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const pass = rosterIndex(roster).hashes.get(hash);
  const student = pass && (pass.expiresAt === null || pass.expiresAt > Date.now() + roster.clockOffset) && rosterIndex(roster).uids.get(pass.studentUid);
  if (!student) throw new Error('This QR is unavailable offline. Use a prepared printed QR or check the exact student ID with a school ID.');
  return student;
}
export async function authorizeRosterQr(roster: OfflineRoster, token: string) {
  const epoch = await rosterEpoch(roster.actorUid);
  const { data, error } = await supabase.rpc('rmc_authorize_offline_qr', { offline_session_id: roster.id, qr_token: token });
  if (error) throw error;
  const current = (await offlineRosters(roster.actorUid)).find(item => item.id === roster.id);
  if (!current) throw new Error('The downloaded roster was removed. Prepare it again.');
  const next = { ...current, qrHashes: [...current.qrHashes.filter(qr => qr.hash !== data.hash), data] };
  await saveRoster(next, epoch);
}
export async function lookupScannerStudent(roster: OfflineRoster, query: { studentId?: string; qrToken?: string }): Promise<OfflineStudent> {
  const current = await currentOfflineRoster(roster.actorUid, roster.id);
  if (!current) throw new Error('The downloaded roster was removed. Prepare it again.');
  if (query.qrToken) {
    if (!/^RMC1:[0-9a-f]{64}$/.test(query.qrToken)) throw new Error('Invalid QR code.');
    try { return await rosterQrStudent(current, query.qrToken); } catch { /* A missing/expired cached pass needs server authorization. */ }
  } else {
    const student = rosterStudent(current, query.studentId || '');
    if (student) return student;
  }
  if (!navigator.onLine) throw new Error('This student or QR is unavailable in the saved roster. Reconnect to verify it.');
  const epoch = await rosterEpoch(roster.actorUid);
  const session = await supabase.auth.getSession();
  if (session.error || session.data.session?.user.id !== roster.actorUid) throw new Error('Sign in again to verify this student.');
  const { data, error } = await supabase.rpc('rmc_lookup_scanner_student', { offline_session_id: roster.id, lookup_student_id: query.qrToken ? null : query.studentId?.trim() || null, qr_token: query.qrToken || null });
  if (error) throw error;
  if (data?.actorUid !== roster.actorUid || data.sessionId !== roster.id || !data.student?.uid || data.student.account_status !== 'active') throw new Error('The server did not authorize this roster lookup.');
  const saved = await currentOfflineRoster(roster.actorUid, roster.id);
  if (!saved) throw new Error('The roster was cleared. Sign in again.');
  const next: OfflineRoster = { ...saved, students: [...saved.students.filter(student => student.uid !== data.student.uid), data.student], qrHashes: data.qrHash ? [...saved.qrHashes.filter(pass => pass.hash !== data.qrHash.hash), data.qrHash] : saved.qrHashes };
  await saveRoster(next, epoch);
  return data.student;
}

type SavedPhoto = { src: string; dataUrl: string; expiresAt: number; cachedAt: number };
const photoId = (owner: string, uid: string) => `photo:${owner}:${uid}`;
export async function offlinePhoto(owner: string, uid: string, src: string, requireFresh = false): Promise<string | undefined> {
  if (!globalThis.indexedDB) return undefined;
  const row = await transaction<Stored | undefined>('records', 'readonly', store => store.get(photoId(owner, uid)));
  if (!row || row.owner !== owner || row.kind !== 'photo') return undefined;
  const photo = await decrypt<SavedPhoto>(row);
  return photo.src === src && photo.expiresAt > Date.now() && (!requireFresh || Date.now() - photo.cachedAt < 15 * 60000) ? photo.dataUrl : undefined;
}
export async function saveOfflinePhoto(roster: OfflineRoster, uid: string, src: string, dataUrl: string, epoch: number, isCurrent: () => boolean) {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 180000) throw new Error('Unsupported or oversized scanner thumbnail.');
  const current = await currentOfflineRoster(roster.actorUid, roster.id);
  if (!current || rosterIndex(current).uids.get(uid)?.photo_url !== src) throw new Error('This photo is no longer in the authorized roster.');
  const record = await encryptedRecord(roster.actorUid, 'photo', photoId(roster.actorUid, uid), { src, dataUrl, cachedAt: Date.now(), expiresAt: Math.min(roster.syncUntil - roster.clockOffset, Date.now() + 86400000) } satisfies SavedPhoto);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['keys', 'records'], 'readwrite'), keys = tx.objectStore('keys');
    const budget = keys.get(`photo-budget:${roster.actorUid}`), oldSize = keys.get(`photo-size:${record.id}`), request = keys.get(rosterEpochKey(roster.actorUid));
    request.onsuccess = () => {
      const bytes = (budget.result || 0) - (oldSize.result || 0) + record.cipher.byteLength;
      if ((request.result || 0) !== epoch || !isCurrent() || bytes > 50 * 1024 * 1024) tx.abort();
      else { tx.objectStore('records').put(record); keys.put(bytes, `photo-budget:${roster.actorUid}`); keys.put(record.cipher.byteLength, `photo-size:${record.id}`); }
    };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error('Photo caching was cancelled or device storage is full.'));
  });
  changed('photo', roster.actorUid);
}
export const offlineRosterEpoch = rosterEpoch;
export async function queueAttendance(roster: OfflineRoster, input: Omit<AttendanceSubmission, 'id' | 'sessionId' | 'capturedAt'>): Promise<QueuedAttendance> {
  const saved = await currentOfflineRoster(roster.actorUid, roster.id);
  if (!saved) throw new Error('The downloaded roster was removed. Prepare it again.');
  roster = saved;
  const capturedAt = Date.now() + roster.clockOffset;
  if (capturedAt < roster.preparedAt || capturedAt > roster.captureUntil || capturedAt < roster.event.startTime || capturedAt > roster.event.endTime) throw new Error('Offline preparation expired or this event is outside its attendance period. Reconnect to prepare again.');
  const student = rosterIndex(roster).uids.get(input.studentUid);
  if (!student) throw new Error('Student is not in the downloaded event roster.');
  if (!input.qrToken && input.manualReason.trim().length < 5) throw new Error('Provide an identity-check reason for manual attendance.');
  if (input.qrToken && (await rosterQrStudent(roster, input.qrToken)).uid !== student.uid) throw new Error('QR does not match this student.');
  if (roster.event.geofenceEnabled !== false) {
    const pos = input.position;
    if (!pos || !Number.isFinite(pos.timestamp) || Math.abs(Date.now() - pos.timestamp) > 60000 || !Number.isFinite(pos.accuracy) || pos.accuracy < 0 || pos.accuracy > 100) throw new Error('A fresh, accurate GPS location is required for offline attendance.');
    if (!Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude) || Math.abs(pos.latitude) > 90 || Math.abs(pos.longitude) > 180 || getDistanceFromLatLonInMeters(pos.latitude, pos.longitude, roster.event.location.lat, roster.event.location.lng) > roster.event.location.radius_meters) throw new Error('Scanner is outside the event geofence.');
  }
  const row: QueuedAttendance = {
    actorUid: roster.actorUid, studentName: student.name, studentId: student.student_id, eventTitle: roster.event.title,
    submission: { ...input, id: crypto.randomUUID(), sessionId: roster.id, capturedAt, position: input.position ? { ...input.position, timestamp: input.position.timestamp + roster.clockOffset } : null },
    state: 'pending', attempts: 0,
  };
  await save(row.actorUid, 'scan', row.submission.id, row);
  return row;
}
function retryable(error: { code?: string; message?: string; status?: number }) {
  return !error.code || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', 'PGRST301', 'PGRST303', '57014', '40001', '40P01', '53300', '57P01'].includes(error.code)
    || (error.status || 0) >= 500 || /fetch|network|timeout|jwt|sign in|complete mfa/i.test(error.message || '');
}
async function migrateQueueMetadata(owner: string) {
  if (metadataReady.has(owner)) return;
  const rows = (await transaction<Stored[]>('records', 'readonly', store => store.index('ownerKind').getAll([owner, 'scan']))).filter(row => !row.state);
  for (const row of rows) {
    const value = await decrypt<QueuedAttendance>(row);
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'), current = store.get(row.id);
      current.onsuccess = () => { if (current.result && !current.result.state) store.put({ ...current.result, state: value.state }); };
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error('Offline queue indexing failed.'));
    });
  }
  metadataReady.add(owner);
}
export async function syncOfflineAttendance(owner: string): Promise<void> {
  if (!navigator.onLine || !globalThis.indexedDB) return;
  if (busy.has(owner)) { syncAgain.add(owner); return busy.get(owner); }
  const execute = async () => {
    await migrateQueueMetadata(owner);
    const pendingRows = (await Promise.all(['pending', 'rejected'].map(state => transaction<Stored[]>('records', 'readonly', store => store.index('ownerState').getAll([owner, 'scan', state]))))).flat();
    const queue = sortQueue(await Promise.all(pendingRows.map(row => decrypt<QueuedAttendance>(row))));
    const chains = new Map<string, QueuedAttendance[]>();
    for (const row of queue.filter(item => item.state !== 'synced')) {
      const chain = chains.get(row.submission.studentUid) || [];
      chain.push(row); chains.set(row.submission.studentUid, chain);
    }
    const groups = [...chains.values()]; let nextGroup = 0, interrupted = false;
    const worker = async () => {
    while (nextGroup < groups.length && !interrupted) {
    for (const savedRow of groups[nextGroup++]) {
      const row = { ...savedRow, submission: { ...savedRow.submission } };
      if (row.state === 'rejected') break; // Keep each student's captures ordered, including across refreshed grants.
      if (!navigator.onLine || interrupted) { interrupted = true; break; }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || sessionData.session?.user.id !== owner) { interrupted = true; break; }
      let data: any, error: any;
      try { ({ data, error } = await supabase.rpc('rmc_sync_offline_attendance', { submission: row.submission })); }
      catch (failure) { error = { message: failure instanceof Error ? failure.message : 'Network unavailable.' }; }
      row.attempts++;
      if (error) {
        row.error = error.message || 'Sync failed. Reconnect and retry.';
        row.state = retryable(error) ? 'pending' : 'rejected';
        await save(owner, 'scan', row.submission.id, row);
        if (row.state === 'pending') interrupted = true;
        break;
      } else {
        if (!data?.request_id || data.request_id !== row.submission.id) throw new Error('The server did not confirm this attendance record. It remains pending.');
        row.state = 'synced'; row.receipt = data; delete row.error;
        // Confirmed records need only their receipt and basic review details locally.
        row.submission.qrToken = null; row.submission.position = null;
        await save(owner, 'scan', row.submission.id, row);
      }
    }
    }
    };
    // Independent students can sync in parallel; a student's scan-out always follows their scan-in.
    const results = await Promise.allSettled([worker(), worker(), worker()]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return !interrupted;
  };
  const run = async () => {
    const drain = async () => { do { syncAgain.delete(owner); if (!(await execute())) break; } while (syncAgain.has(owner) && navigator.onLine); };
    if (navigator.locks?.request) await navigator.locks.request(`rmc-attendance-sync:${owner}`, drain);
    else await drain(); // Server receipt IDs make retries across tabs safe too.
  };
  const promise = run().finally(() => busy.delete(owner));
  busy.set(owner, promise);
  return promise;
}
export async function retryOfflineAttendance(owner: string, id: string) {
  const saved = (await offlineQueue(owner)).find(item => item.submission.id === id);
  if (!saved || saved.state === 'synced') return;
  const row = { ...saved, submission: { ...saved.submission } };
  row.state = 'pending'; delete row.error;
  await save(owner, 'scan', id, row);
  await syncOfflineAttendance(owner);
}
export async function clearOfflineRosters(owner: string) {
  if (!globalThis.indexedDB) return;
  invalidate(undefined, owner);
  // Pending/rejected attendance is retained for this account's next verified sign-in.
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['keys', 'records'], 'readwrite'), store = tx.objectStore('keys'), records = tx.objectStore('records');
    const epoch = store.get(rosterEpochKey(owner));
    epoch.onsuccess = () => store.put((epoch.result || 0) + 1, rosterEpochKey(owner));
    const rows = records.index('owner').getAll(owner);
    rows.onsuccess = () => { for (const row of rows.result as Stored[]) if (row.kind === 'roster' || row.kind === 'photo') { records.delete(row.id); if (row.kind === 'photo') store.delete(`photo-size:${row.id}`); } };
    store.delete(`photo-budget:${owner}`);
    const active = store.get('active-owner');
    active.onsuccess = () => { if (active.result === owner) store.delete('active-owner'); };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error('Offline roster cleanup failed.'));
  });
  changed(undefined, owner);
}
export async function removeSyncedAttendance(owner: string) {
  for (const row of (await offlineQueue(owner)).filter(item => item.state === 'synced')) await transaction('records', 'readwrite', store => store.delete(row.submission.id));
  queueMemory.delete(owner); changed('scan', owner);
}
