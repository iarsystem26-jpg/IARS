import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import { writeFileSync } from 'node:fs';
import type { OfflineRoster } from './offlineAttendance';
import { unitStorageKey } from './educationalUnit';

const api = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: api.rpc, auth: { getSession: api.getSession } } }));
let service: typeof import('./offlineAttendance');
const token = `RMC1:${'a'.repeat(64)}`;
const baseRoster = async (): Promise<Omit<OfflineRoster, 'clockOffset'>> => ({
  id: 'session-1', actorUid: 'mayor', actor: { uid: 'mayor', name: 'Mayor', student_id: 'M-1', role: 'mayor', account_status: 'active', photo_url: '', school_data: { type: 'College', level: '1', section: 'A' } },
  event: { id: 'event-1', title: 'Assembly', startTime: Date.now()-60000, endTime: Date.now()+600000, geofenceEnabled: false } as OfflineRoster['event'],
  preparedAt: Date.now(), captureUntil: Date.now()+600000, syncUntil: Date.now()+259200000,
  students: [{ uid: 'student', name: 'Student', student_id: 'S-001', role: 'student', account_status: 'active', photo_url: '', school_data: { type: 'College', level: '1', section: 'A' } }],
  qrHashes: [{ studentUid: 'student', expiresAt: null, hash: Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token.slice(5)))).toString('hex') }],
});
async function prepare() {
  api.rpc.mockResolvedValueOnce({ data: await baseRoster(), error: null });
  return service.prepareOfflineAttendance('mayor', 'event-1');
}
const manual = { studentUid: 'student', direction: 'in' as const, qrToken: null, manualReason: 'Verified school ID', position: null };
beforeEach(async () => {
  vi.resetModules(); api.rpc.mockReset(); api.getSession.mockReset();
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('TextDecoder', TextDecoder); vi.stubGlobal('BroadcastChannel', undefined);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  api.getSession.mockResolvedValue({ data: { session: { user: { id: 'mayor' } } }, error: null });
  service = await import('./offlineAttendance');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('looks up exact IDs and prepared printed QR hashes while offline', async () => {
  const roster = await prepare();
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  expect(service.rosterStudent(roster, ' s-001 ')?.uid).toBe('student');
  expect(service.rosterStudent(roster, 'S-00')).toBeUndefined();
  expect((await service.rosterQrStudent(roster, token)).uid).toBe('student');
  await expect(service.rosterQrStudent(roster, `RMC1:${'b'.repeat(64)}`)).rejects.toThrow('unavailable offline');
  expect(api.rpc).toHaveBeenCalledTimes(1);
});
it('uses cached online IDs and QR hashes without lookup RPCs or roster decryption per capture', async () => {
  const roster = await prepare();
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  expect((await service.lookupScannerStudent(roster, { studentId: ' s-001 ' })).uid).toBe('student');
  expect((await service.lookupScannerStudent(roster, { qrToken: token })).uid).toBe('student');
  await service.queueAttendance(roster, manual);
  expect(api.rpc).toHaveBeenCalledOnce(); expect(decrypt).not.toHaveBeenCalled();
});
it('checks missing QR on the backend once and encrypts the authorized hash for later local lookup', async () => {
  const roster = await prepare(), missing = `RMC1:${'b'.repeat(64)}`;
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(missing.slice(5)))).toString('hex');
  api.rpc.mockResolvedValueOnce({ data: { sessionId: roster.id, actorUid: 'mayor', student: { ...roster.students[0], name: 'Updated Student', photo_url: 'storage://rmc-documents/student/photo/example.png' }, qrHash: { studentUid: 'student', hash, expiresAt: null } }, error: null });
  expect((await service.lookupScannerStudent(roster, { qrToken: missing })).name).toBe('Updated Student');
  expect((await service.lookupScannerStudent(roster, { qrToken: missing })).name).toBe('Updated Student');
  expect(api.rpc).toHaveBeenCalledTimes(2);
  const queued = await service.queueAttendance(roster, { ...manual, qrToken: missing });
  expect(queued.studentName).toBe('Updated Student');
});
it('adds an authorized student missing from the local roster and rejects denied lookups', async () => {
  const roster = await prepare();
  api.rpc.mockResolvedValueOnce({ data: { sessionId: roster.id, actorUid: 'mayor', student: { ...roster.students[0], uid: 'new', student_id: 'S-NEW' }, qrHash: null }, error: null });
  expect((await service.lookupScannerStudent(roster, { studentId: 'S-NEW' })).uid).toBe('new');
  await service.queueAttendance(roster, { ...manual, studentUid: 'new' });
  api.rpc.mockResolvedValueOnce({ data: null, error: { message: 'No eligible student' } });
  await expect(service.lookupScannerStudent(roster, { studentId: 'outsider' })).rejects.toThrow('No eligible student');
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await expect(service.lookupScannerStudent(roster, { studentId: 'missing' })).rejects.toThrow('Reconnect');
});
it('does not restore roster data when a lookup response arrives after logout', async () => {
  const roster = await prepare();
  let release!: (result: unknown) => void;
  api.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const lookup = service.lookupScannerStudent(roster, { studentId: 'S-NEW' });
  const rejected = expect(lookup).rejects.toThrow('cleared');
  await vi.waitFor(() => expect(api.rpc).toHaveBeenCalledTimes(2));
  await service.clearOfflineRosters('mayor');
  release({ data: { sessionId: roster.id, actorUid: 'mayor', student: { ...roster.students[0], uid: 'new', student_id: 'S-NEW' } }, error: null });
  await rejected; expect(await service.offlineRosters('mayor')).toEqual([]);
});
it('refreshes cached names, IDs, and photo references from authorized snapshots without adding ungranted students', async () => {
  const roster = await prepare();
  const updated = { ...roster.students[0], student_id: 'S-UPDATED', name: 'New Name', photo_url: 'storage://rmc-documents/student/photo/new.png', email: 'excluded@example.test', guardian: { phone: 'excluded' } };
  await service.refreshCachedRosterProfiles('mayor', [updated, { ...updated, uid: 'new-ungranted', student_id: 'UNGRANTED' }], () => true);
  const saved = (await service.offlineRosters('mayor'))[0];
  expect(service.rosterStudent(saved, 'S-UPDATED')?.name).toBe('New Name');
  expect(service.rosterStudent(saved, 'UNGRANTED')).toBeUndefined(); expect(JSON.stringify(saved.students)).not.toContain('excluded');
  expect(api.rpc).toHaveBeenCalledOnce();
});
it('encrypts scoped photo thumbnails, rejects stale source/owner writes, and removes them on logout', async () => {
  const source = await baseRoster(); source.students[0].photo_url = 'storage://rmc-documents/student/photo/example.png';
  api.rpc.mockResolvedValueOnce({ data: source, error: null });
  const roster = await service.prepareOfflineAttendance('mayor', 'event-1'), epoch = await service.offlineRosterEpoch('mayor');
  const image = 'data:image/png;base64,aW1hZ2U=';
  await service.saveOfflinePhoto(roster, 'student', source.students[0].photo_url!, image, epoch, () => true);
  expect(await service.offlinePhoto('mayor', 'student', source.students[0].photo_url!)).toBe(image);
  expect(await service.offlinePhoto('outsider', 'student', source.students[0].photo_url!)).toBeUndefined();
  expect(await service.offlinePhoto('mayor', 'student', 'changed-source')).toBeUndefined();
  await expect(service.saveOfflinePhoto(roster, 'student', 'changed-source', image, epoch, () => true)).rejects.toThrow('authorized roster');
  await service.queueAttendance(roster, manual); await service.clearOfflineRosters('mayor');
  expect(await service.offlinePhoto('mayor', 'student', source.students[0].photo_url!)).toBeUndefined();
  await expect(service.saveOfflinePhoto(roster, 'student', source.students[0].photo_url!, image, epoch, () => true)).rejects.toThrow();
  expect((await service.offlineQueue('mayor'))[0].state).toBe('pending');
});
it('keeps two current roster versions per event without losing queued scans or hourly rate accounting', async () => {
  const first = await prepare(), queued = await service.queueAttendance(first, manual);
  for (let i = 2; i <= 4; i++) {
    const data = await baseRoster(); data.id = `session-${i}`;
    // Distinct server preparation times keep version ordering independent of test speed.
    data.preparedAt = first.preparedAt + i * 1000;
    api.rpc.mockResolvedValueOnce({ data, error: null }); await service.prepareOfflineAttendance('mayor', 'event-1');
  }
  const saved = await service.offlineRosters('mayor'); expect(saved).toHaveLength(2);
  expect(saved.map(roster => roster.id)).toEqual(['session-4', 'session-3']);
  expect((await service.offlineQueue('mayor'))[0].submission.id).toBe(queued.submission.id);
  expect(await service.recentRosterPreparations('mayor')).toBe(4);
  api.rpc.mockResolvedValueOnce({ data: { request_id: queued.submission.id }, error: null });
  await service.syncOfflineAttendance('mayor'); expect((await service.offlineQueue('mayor'))[0].state).toBe('synced');
});
it('upgrades version-one encrypted queues and indexes their states without dropping pending records', async () => {
  const encryptionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const id = crypto.randomUUID(), iv = crypto.getRandomValues(new Uint8Array(12));
  const queued = { actorUid: 'mayor', studentName: 'Student', studentId: 'S-001', eventTitle: 'Assembly', state: 'pending', attempts: 0,
    submission: { ...manual, id, sessionId: 'old-session', capturedAt: Date.now() } };
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`mayor:scan:${id}`) }, encryptionKey, new TextEncoder().encode(JSON.stringify(queued)));
  const request = indexedDB.open(unitStorageKey('offline-attendance-v1'), 1);
  await new Promise<void>((resolve, reject) => {
    request.onupgradeneeded = () => { request.result.createObjectStore('keys'); request.result.createObjectStore('records', { keyPath: 'id' }).createIndex('owner', 'owner'); };
    request.onsuccess = () => { const db = request.result, tx = db.transaction(['keys', 'records'], 'readwrite'); tx.objectStore('keys').put(encryptionKey, 'mayor'); tx.objectStore('records').put({ id, owner: 'mayor', kind: 'scan', iv, cipher }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  expect((await service.offlineQueue('mayor'))[0].submission.id).toBe(id);
  api.rpc.mockResolvedValueOnce({ data: { request_id: id }, error: null });
  await service.syncOfflineAttendance('mayor'); expect((await service.offlineQueue('mayor'))[0].state).toBe('synced');
});
it('continues draining scans added during an in-flight sync without waiting for a polling cycle', async () => {
  const roster = await prepare(), first = await service.queueAttendance(roster, manual);
  let release!: (result: unknown) => void;
  api.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const sync = service.syncOfflineAttendance('mayor');
  await vi.waitFor(() => expect(api.rpc).toHaveBeenCalledTimes(2));
  const second = await service.queueAttendance(roster, { ...manual, direction: 'out' });
  void service.syncOfflineAttendance('mayor');
  api.rpc.mockResolvedValueOnce({ data: { request_id: second.submission.id }, error: null });
  release({ data: { request_id: first.submission.id }, error: null }); await sync;
  expect((await service.offlineQueue('mayor')).map(row => row.state)).toEqual(['synced', 'synced']);
});
it('syncs independent students concurrently while preserving each student’s in/out order', async () => {
  const source = await baseRoster(); source.students.push({ ...source.students[0], uid: 'second', student_id: 'S-002' });
  api.rpc.mockResolvedValueOnce({ data: source, error: null });
  const roster = await service.prepareOfflineAttendance('mayor', 'event-1');
  const firstIn = await service.queueAttendance(roster, manual);
  const firstOut = await service.queueAttendance(roster, { ...manual, direction: 'out' });
  const secondIn = await service.queueAttendance(roster, { ...manual, studentUid: 'second' });
  const releases = new Map<string, (value: any) => void>();
  api.rpc.mockImplementation((_name, { submission }) => new Promise(resolve => { releases.set(submission.id, resolve); }));
  const sync = service.syncOfflineAttendance('mayor');
  await vi.waitFor(() => expect(releases.size).toBe(2));
  expect(releases.has(firstIn.submission.id)).toBe(true); expect(releases.has(secondIn.submission.id)).toBe(true);
  expect(releases.has(firstOut.submission.id)).toBe(false);
  releases.get(firstIn.submission.id)!({ data: { request_id: firstIn.submission.id }, error: null });
  await vi.waitFor(() => expect(releases.has(firstOut.submission.id)).toBe(true));
  releases.get(secondIn.submission.id)!({ data: { request_id: secondIn.submission.id }, error: null });
  releases.get(firstOut.submission.id)!({ data: { request_id: firstOut.submission.id }, error: null });
  await sync; expect((await service.offlineQueue('mayor')).every(row => row.state === 'synced')).toBe(true);
});
it('benchmarks indexed lookup and encrypted capture with a 10,000-student roster', async () => {
  const source = await baseRoster();
  source.students = Array.from({ length: 10000 }, (_, i) => ({ ...source.students[0], uid: `student-${i}`, student_id: `S-${i}`, name: `Student ${i}` }));
  api.rpc.mockResolvedValueOnce({ data: source, error: null });
  const roster = await service.prepareOfflineAttendance('mayor', 'event-1');
  const lookupStart = performance.now();
  let matched = 0;
  for (let i = 0; i < 10000; i++) if (service.rosterStudent(roster, `S-${i}`)?.uid === `student-${i}`) matched++;
  const lookupMs = performance.now() - lookupStart, captures: number[] = [];
  expect(matched).toBe(10000);
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  for (let i = 0; i < 100; i++) { const start = performance.now(); await service.queueAttendance(roster, { ...manual, studentUid: `student-${i}` }); captures.push(performance.now() - start); }
  expect(decrypt).not.toHaveBeenCalled(); expect(api.rpc).toHaveBeenCalledOnce();
  captures.sort((a,b) => a-b);
  writeFileSync('.fast-scanner-benchmark.local', JSON.stringify({ environment: 'Desktop Node WebCrypto with fake IndexedDB; network/GPS/camera excluded', students: 10000, lookups: 10000, lookupMs, encryptedCaptures: 100, captureMedianMs: captures[50], captureP95Ms: captures[95], lookupRpcCalls: 0, rosterDecryptionsPerCapture: decrypt.mock.calls.length }, null, 2));
  console.log(`Scanner benchmark (fake IndexedDB/desktop): 10,000 IDs ${lookupMs.toFixed(1)} ms; 100 encrypted captures median ${captures[50].toFixed(2)} ms, p95 ${captures[95].toFixed(2)} ms.`);
});
it('rejects a late roster response after logout, including a cleanup from another tab', async () => {
  let resolve!: (value: unknown) => void;
  api.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const preparation = service.prepareOfflineAttendance('mayor', 'event-1');
  const result = expect(preparation).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
  vi.resetModules(); const otherTab = await import('./offlineAttendance');
  await otherTab.clearOfflineRosters('mayor');
  resolve({ data: await baseRoster(), error: null }); await result;
  expect(await service.offlineRosters('mayor')).toEqual([]);
  expect(await service.restoreActiveOfflineScanner()).toBeUndefined();
  expect((await prepare()).event.id).toBe('event-1');
});
it('checks the active account before preparation and before saving its response', async () => {
  api.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  await expect(service.prepareOfflineAttendance('mayor', 'event-1')).rejects.toThrow('Sign in again');
  expect(api.rpc).not.toHaveBeenCalled();
  api.rpc.mockResolvedValueOnce({ data: await baseRoster(), error: null });
  api.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'mayor' } } }, error: null });
  api.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'another-user' } } }, error: null });
  await expect(service.prepareOfflineAttendance('mayor', 'event-1')).rejects.toThrow('cancelled');
  expect(await service.offlineRosters('mayor')).toEqual([]);
});
it('blocks an encrypted roster commit when logout happens during encryption', async () => {
  const originalEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  let release!: () => void, started!: () => void;
  const reachedEncryption = new Promise<void>(resolve => { started = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => { started(); await barrier; return originalEncrypt(...args); });
  api.rpc.mockResolvedValueOnce({ data: await baseRoster(), error: null });
  const preparation = service.prepareOfflineAttendance('mayor', 'event-1');
  const result = expect(preparation).rejects.toThrow('cancelled');
  await reachedEncryption; await service.clearOfflineRosters('mayor'); release(); await result;
  expect(await service.offlineRosters('mayor')).toEqual([]);
  expect(await service.restoreActiveOfflineScanner()).toBeUndefined();
});
it('cancels an automatic preparation when its login generation becomes stale', async () => {
  let active = true;
  api.rpc.mockImplementationOnce(async () => { active = false; return { data: await baseRoster(), error: null }; });
  await expect(service.prepareOfflineAttendance('mayor', 'event-1', () => active)).rejects.toThrow('cancelled');
  expect(await service.offlineRosters('mayor')).toEqual([]);
});
it('persists encrypted attendance before returning a pending result, across reloads', async () => {
  const roster = await prepare();
  const queued = await service.queueAttendance(roster, manual);
  expect(queued.state).toBe('pending');
  expect(api.rpc).toHaveBeenCalledTimes(1);
  const request = indexedDB.open(unitStorageKey('offline-attendance-v1'));
  const rows = await new Promise<any[]>(resolve => { request.onsuccess = () => { const tx = request.result.transaction('records'); const r = tx.objectStore('records').getAll(); r.onsuccess = () => resolve(r.result); }; });
  expect(JSON.stringify(rows)).not.toContain('Student');
  expect(rows.find(row => row.kind==='scan').cipher.byteLength).toBeGreaterThan(16);
  const encryptionKey = await new Promise<CryptoKey>(resolve => {
    const lookup = request.result.transaction('keys').objectStore('keys').get('mayor');
    lookup.onsuccess = () => resolve(lookup.result);
  });
  expect(encryptionKey.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  expect(encryptionKey.extractable).toBe(false);
  await expect(crypto.subtle.exportKey('raw', encryptionKey)).rejects.toThrow();
  vi.resetModules(); service = await import('./offlineAttendance');
  expect((await service.offlineQueue('mayor'))[0].submission.id).toBe(queued.submission.id);
  expect((await service.restoreOfflineScanner('mayor'))?.event.id).toBe('event-1');
  expect((await service.restoreActiveOfflineScanner())?.actorUid).toBe('mayor');
});
it('fails closed when encrypted roster data is tampered with', async () => {
  await prepare();
  const request = indexedDB.open(unitStorageKey('offline-attendance-v1'));
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      const tx = request.result.transaction('records', 'readwrite'), store = tx.objectStore('records');
      const lookup = store.get('session-1');
      lookup.onsuccess = () => { const record = lookup.result; new Uint8Array(record.cipher)[0] ^= 1; store.put(record); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    };
  });
  await expect(service.offlineRosters('mayor')).rejects.toThrow();
  await expect(service.restoreActiveOfflineScanner()).rejects.toThrow();
});
it('keeps another account’s roster and pending scans out of lookup and sync', async () => {
  await service.queueAttendance(await prepare(), manual);
  expect(await service.offlineRosters('outsider')).toEqual([]);
  expect(await service.offlineQueue('outsider')).toEqual([]);
  api.getSession.mockResolvedValue({ data: { session: { user: { id: 'outsider' } } }, error: null });
  await service.syncOfflineAttendance('mayor');
  expect(api.rpc).toHaveBeenCalledTimes(1);
});
it('retries a lost response using the original request identifier and payload', async () => {
  const queued = await service.queueAttendance(await prepare(), manual);
  api.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch', code: '' } });
  await service.syncOfflineAttendance('mayor');
  expect((await service.offlineQueue('mayor'))[0].state).toBe('pending');
  api.rpc.mockResolvedValueOnce({ data: { request_id: queued.submission.id, time_in: queued.submission.capturedAt, status: 'present', replayed: true }, error: null });
  await service.syncOfflineAttendance('mayor');
  expect(api.rpc.mock.calls[1][1]).toEqual(api.rpc.mock.calls[2][1]);
  expect((await service.offlineQueue('mayor'))[0].state).toBe('synced');
});
it('preserves rejected scans and blocks dependent scan-outs until review', async () => {
  const roster = await prepare();
  await service.queueAttendance(roster, manual);
  await new Promise(resolve => setTimeout(resolve, 5));
  await service.queueAttendance(roster, { ...manual, direction: 'out' });
  api.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Permission required: attendance.scan' } });
  await service.syncOfflineAttendance('mayor');
  const rows = await service.offlineQueue('mayor');
  expect(rows.map(row => row.state)).toEqual(['rejected','pending']);
  await service.syncOfflineAttendance('mayor');
  expect(api.rpc).toHaveBeenCalledTimes(2);
});
it('leaves stale-session/MFA failures pending instead of losing attendance', async () => {
  await service.queueAttendance(await prepare(), manual);
  api.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Sign in and complete MFA to sync attendance.' } });
  await service.syncOfflineAttendance('mayor');
  expect((await service.offlineQueue('mayor'))[0].state).toBe('pending');
});
it('never confirms a successful-looking response without the server receipt identifier', async () => {
  await service.queueAttendance(await prepare(), manual);
  api.rpc.mockResolvedValueOnce({ data: { status: 'present' }, error: null });
  await expect(service.syncOfflineAttendance('mayor')).rejects.toThrow('did not confirm');
  expect((await service.offlineQueue('mayor'))[0].state).toBe('pending');
});
it('serializes concurrent sync attempts and removes proof data after acknowledgement', async () => {
  const row = await service.queueAttendance(await prepare(), { ...manual, qrToken: token });
  api.rpc.mockResolvedValue({ data: { request_id: row.submission.id, time_in: row.submission.capturedAt, status: 'present' }, error: null });
  await Promise.all([service.syncOfflineAttendance('mayor'),service.syncOfflineAttendance('mayor')]);
  expect(api.rpc).toHaveBeenCalledTimes(2);
  expect((await service.offlineQueue('mayor'))[0].submission.qrToken).toBeNull();
});
it('clears downloaded rosters at logout and retains pending scans for the original account', async () => {
  const roster = await prepare(); await service.queueAttendance(roster, manual);
  await service.clearOfflineRosters('mayor');
  expect(await service.offlineRosters('mayor')).toEqual([]);
  expect(await service.restoreActiveOfflineScanner()).toBeUndefined();
  expect((await service.offlineQueue('mayor'))[0].state).toBe('pending');
  await expect(service.queueAttendance(roster, manual)).rejects.toThrow('removed');
});
it('does not claim local success when storage cannot commit', async () => {
  const roster = await prepare();
  const encrypt = vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('Storage encryption failed'));
  await expect(service.queueAttendance(roster, manual)).rejects.toThrow('Storage encryption failed');
  encrypt.mockRestore(); expect(await service.offlineQueue('mayor')).toEqual([]);
});
it('rejects expired preparations and large device-clock differences', async () => {
  const data = await baseRoster(); data.preparedAt-=120000;
  api.rpc.mockResolvedValueOnce({ data, error: null });
  await expect(service.prepareOfflineAttendance('mayor','event-1')).rejects.toThrow('automatic date and time');
  const roster = await prepare();
  const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now+700000);
  await expect(service.queueAttendance(roster, manual)).rejects.toThrow('expired');
});
it('validates GPS freshness and distance before accepting an offline geofenced scan', async () => {
  const data = await baseRoster(); data.event.geofenceEnabled=true; data.event.location={ lat:7, lng:125, radius_meters:100 };
  api.rpc.mockResolvedValueOnce({ data, error:null });
  const roster=await service.prepareOfflineAttendance('mayor','event-1');
  await expect(service.queueAttendance(roster,manual)).rejects.toThrow('GPS');
  await expect(service.queueAttendance(roster,{...manual,position:{latitude:0,longitude:0,accuracy:5,timestamp:Date.now()}})).rejects.toThrow('geofence');
  expect((await service.queueAttendance(roster,{...manual,position:{latitude:7,longitude:125,accuracy:5,timestamp:Date.now()}})).state).toBe('pending');
});
