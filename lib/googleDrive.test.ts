import { afterAll, afterEach, expect, it, vi } from 'vitest';
vi.hoisted(() => vi.stubEnv('VITE_GOOGLE_DRIVE_GAS_URL', 'https://image-service.test/exec'));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } } }));
import { createDriveImage, getDriveImage, updateDriveImage, publicDriveImageUrl, deleteDriveImage, retainProfileImage, fileAsDataUrl, manageDriveFolder } from './googleDrive';

import { toast, toastStore } from './toast';
afterAll(() => vi.unstubAllEnvs());

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); toastStore.getSnapshot().forEach(item => toast.dismiss(item.id)); });
it('shares repeated folder reads without progress toasts and releases them after completion', async () => {
  let finish!: (response: unknown) => void;
  const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const first = manageDriveFolder('setup');
  const second = manageDriveFolder('setup');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(toastStore.getSnapshot()).toHaveLength(0);
  finish({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, folder: { id: 'root' }, folders: [] }) });
  await Promise.all([first, second]);
  fetcher.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, folder: { id: 'root' }, folders: [] }) });
  await manageDriveFolder('setup');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('keeps uploads disabled without contacting a previous image service when no endpoint is configured', async () => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_GAS_URL', '');
  vi.resetModules();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  try {
    const unconfigured = await import('./googleDrive');
    await expect(unconfigured.getDriveImage('file-id')).rejects.toThrow('Photo uploads are temporarily unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.stubEnv('VITE_GOOGLE_DRIVE_GAS_URL', 'https://image-service.test/exec');
  }
});
it.each([
  ['failed-save', 'Clean up unsaved photo', 'Unsaved upload removed. Your previous photo was kept.'],
  ['replacement', 'Remove replaced photo', 'Old photo removed. Your new photo is saved.'],
  ['delete', 'Delete photo', 'Photo moved to Drive trash.'],
] as const)('explains %s removal while pending and after completion', async (reason, title, message) => {
  let finish!: (response: unknown) => void;
  const fetcher = vi.fn((_url: string, _options: RequestInit) => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const pending = deleteDriveImage('old-file', reason);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'progress', title, phase: 0 });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({ action: 'delete', fileId: 'old-file' });
  finish({ ok: true, status: 200, text: async () => '{"success":true}' });
  await pending;
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'success', title, message });
});

it.each(['failed-save', 'replacement', 'delete'] as const)('reports a contextual failure for %s removal', async reason => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
  await expect(deleteDriveImage('old-file', reason)).rejects.toThrow('Network offline');
  const notice = toastStore.getSnapshot()[0];
  expect(notice.kind).toBe('error');
  expect(notice.message).toContain(reason === 'replacement' ? 'Your new photo is saved' : reason === 'failed-save' ? 'extra copy may remain' : 'Could not delete');
});

it.each([
  ['create', false], ['create', true], ['update', false], ['read', false],
])('returns a saveable Drive URL for %s (nested result: %s)', async (action, nested) => {
  const id = 'test_Drive-file123';
  const canonicalUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
  const displayUrl = `https://lh3.googleusercontent.com/d/${id}=w4000`;
  const result = { id, name: 'Student - 123.png', url: nested ? displayUrl : canonicalUrl };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    text: async () => JSON.stringify(nested ? { success: true, result } : { success: true, ...result }),
  }));
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  const uploaded = action === 'create' ? await createDriveImage(file, 'Student', '123')
    : action === 'update' ? await updateDriveImage('old-file', file, 'Student', '123')
    : await getDriveImage(id);
  expect(uploaded.url).toBe(canonicalUrl);
  expect(publicDriveImageUrl(uploaded.url)).toBe(displayUrl);
});

it('shows a readable image service error for localized Google HTML pages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<!DOCTYPE html><html><head><script>window.secret = "debug payload";</script></head><body>Hindi Nahanap ang Page</body></html>' }));
  await expect(getDriveImage('file-id')).rejects.toThrow('Google Drive image service is unavailable');
});

it('identifies image validation failures before making a request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(createDriveImage(new File(['text'], 'test.txt', { type: 'text/plain' }), 'Test', '123')).rejects.toThrow('Choose a JPG');
  expect(fetcher).not.toHaveBeenCalled();
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', phase: 0 });
});
it('identifies invalid Drive results at the response validation phase', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"success":true}' }));
  await expect(getDriveImage('file-id')).rejects.toThrow('no public image URL');
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', phase: 1, phases: ['Working on your photo', 'Finishing up'] });
});

it('keeps successful uploads and cleanup working when session storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"success":true,"id":"storage-disabled-file","url":"https://drive.google.com/thumbnail?id=storage-disabled-file&sz=w1600"}' });
  vi.stubGlobal('fetch', fetcher);
  await expect(createDriveImage(new File(['image'], 'photo.png', { type: 'image/png' }), 'Student', '123')).resolves.toHaveProperty('id', 'storage-disabled-file');
  const upload = JSON.parse(fetcher.mock.calls[0][1].body);
  await deleteDriveImage('storage-disabled-file');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).managementToken).toBe(upload.managementToken);
});

it('uploads retained bytes even when the original mobile picker file becomes unreadable', async () => {
  const original = new File(['photo bytes'], 'phone.jpg', { type: 'image/jpeg', lastModified: 123 });
  const retained = await retainProfileImage(original);
  expect(retained.file).not.toBe(original);
  expect(retained.file.name).toBe(original.name);
  expect(retained.file.lastModified).toBe(123);
  const read = FileReader.prototype.readAsDataURL;
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (blob) {
    if (blob === original) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>));
    } else read.call(this, blob);
  });
  // Subsequent reads of the selection now use the shared retained copy too.
  await expect(fileAsDataUrl(original)).resolves.toBe(retained.preview);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"success":true,"id":"retained-photo","url":"https://drive.google.com/thumbnail?id=retained-photo"}' });
  vi.stubGlobal('fetch', fetcher);
  await createDriveImage(retained.file, 'Student', '123');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).dataUrl).toBe(retained.preview);
});

it('preserves the underlying mobile file-read error and classifies it as a photo problem', async () => {
  const cause = new DOMException('Provider access expired', 'NotReadableError');
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () {
    Object.defineProperty(this, 'error', { value: cause });
    queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>));
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const failure = await createDriveImage(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), 'Student', '123').catch(error => error);
  expect(failure.cause).toBe(cause);
  expect(fetcher).not.toHaveBeenCalled();
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', code: 'FILE-002' });
});

it('rejects empty photos before reading them', async () => {
  const reader = vi.spyOn(FileReader.prototype, 'readAsDataURL');
  await expect(retainProfileImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))).rejects.toThrow('empty');
  expect(reader).not.toHaveBeenCalled();
});

it('settles aborted image reads with recovery instructions', async () => {
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () {
    queueMicrotask(() => this.onabort?.(new ProgressEvent('abort') as ProgressEvent<FileReader>));
  });
  await expect(retainProfileImage(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow('Choose the photo again');
});
