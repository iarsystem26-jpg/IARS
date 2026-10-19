import { toast, type OperationProgress } from './toast';
import { supabase } from './supabase';
import { retainedUploadFile } from './fileUploads';

export const GOOGLE_DRIVE_GAS_URL = import.meta.env.VITE_GOOGLE_DRIVE_GAS_URL || '';
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type DriveImageResult = {
  id: string;
  name: string;
  url: string;
};

type DriveResponse = Partial<DriveImageResult> & {
  success?: boolean;
  error?: string;
  message?: string;
  result?: Partial<DriveImageResult>;
};

const temporaryCapabilities = new Map<string, string>();
const capabilityKey = (id: string) => `rmc.drive-capability.${id}`;
function readCapability(id: string) {
  try { return sessionStorage.getItem(capabilityKey(id)) || temporaryCapabilities.get(id); }
  catch { return temporaryCapabilities.get(id); }
}
function rememberCapability(id: string, token: string) {
  temporaryCapabilities.set(id, token);
  try { sessionStorage.setItem(capabilityKey(id), token); } catch { /* Private browsing can disable session storage. */ }
}
function forgetCapability(id: string) {
  temporaryCapabilities.delete(id);
  try { sessionStorage.removeItem(capabilityKey(id)); } catch { /* Nothing was persisted. */ }
}

export function validateProfileImage(file: File) {
  if (!file.size) throw new Error('This image is empty. Choose another photo.');
  if (!PROFILE_IMAGE_TYPES.includes(file.type as (typeof PROFILE_IMAGE_TYPES)[number])) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Profile images must be 5 MB or smaller.');
  }
}

export async function fileAsDataUrl(file: File): Promise<string> {
  try { file = await retainedUploadFile(file); }
  catch (cause) { throw new Error('Unable to read this image. Save the photo to your phone, then choose it again.', { cause }); }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to preview this image.'));
    reader.onerror = () => reject(new Error('Unable to read this image. Save the photo to your phone, then choose it again.', { cause: reader.error }));
    reader.onabort = () => reject(new Error('Image reading was cancelled. Choose the photo again.'));
    reader.readAsDataURL(file);
  });
}

/** Read picker-backed files once while access is available. Upload the retained
 * bytes rather than reopening a mobile gallery/cloud provider's file later. */
export async function retainProfileImage(file: File) {
  validateProfileImage(file);
  const preview = await fileAsDataUrl(file);
  const encoded = preview.slice(preview.indexOf(',') + 1);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  if (bytes.length !== file.size) throw new Error('The image could not be read completely. Choose the photo again.');
  return { file: new File([bytes], file.name, { type: file.type, lastModified: file.lastModified }), preview };
}

function responseError(payload: DriveResponse, status: number) {
  return payload.error || payload.message || `Google Drive upload failed (HTTP ${status}).`;
}

function readableResponseError(text: string, status: number) {
  // Apps Script can return Google's full HTML error page when an old or
  // unpublished deployment is hit. Never show that page inside the form.
  const plain = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/<(?:!doctype|html|head|body)\b/i.test(text) || /page not found|unable to open the file/i.test(plain)) {
    return 'Google Drive image service is unavailable. Redeploy the Apps Script web app and update VITE_GOOGLE_DRIVE_GAS_URL.';
  }
  return plain.slice(0, 300) || responseError({}, status);
}

async function request<T = DriveResponse>(body: Record<string, unknown>, progress: OperationProgress): Promise<T> {
  if (!GOOGLE_DRIVE_GAS_URL) throw new Error('Photo uploads are temporarily unavailable. Please try again after the image service is configured.');
  const { data: { session } } = await supabase.auth.getSession();
  const managementToken = body.action === 'create' ? crypto.randomUUID() + crypto.randomUUID()
    : typeof body.fileId === 'string' ? readCapability(body.fileId) : null;
  const replacementManagementToken = body.action === 'update' && body.dataUrl ? crypto.randomUUID() + crypto.randomUUID() : null;
  progress.step(2);
  const response = await fetch(GOOGLE_DRIVE_GAS_URL, {
    method: 'POST',
    // text/plain avoids a browser preflight against Apps Script while still carrying JSON.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, ...(session?.access_token ? { accessToken: session.access_token } : {}), ...(managementToken ? { managementToken } : {}), ...(replacementManagementToken ? { replacementManagementToken } : {}) }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'follow',
  });
  progress.step(3);
  const text = await response.text();
  let payload: DriveResponse;
  try { payload = JSON.parse(text) as DriveResponse; }
  catch { throw new Error(readableResponseError(text, response.status)); }
  if (!response.ok || payload.success === false || payload.error) throw new Error(responseError(payload, response.status));
  const id = (payload.result || payload).id;
  if (body.action === 'create' && managementToken && id && /^[a-zA-Z0-9_-]+$/.test(id)) rememberCapability(id, managementToken);
  if (body.action === 'update' && replacementManagementToken && id && /^[a-zA-Z0-9_-]+$/.test(id)) rememberCapability(id, replacementManagementToken);
  if (body.action === 'delete' && typeof body.fileId === 'string') forgetCapability(body.fileId);
  return payload as T;
}

function unwrap(payload: DriveResponse): DriveImageResult {
  const value = payload.result || payload;
  if (!value.id || !value.url) throw new Error('Google Drive returned no public image URL.');
  if (!/^[a-zA-Z0-9_-]+$/.test(value.id)) throw new Error('Google Drive returned an invalid file ID.');
  // Persist the canonical Drive URL accepted by profile and enrollment validation.
  // publicDriveImageUrl/driveImageCandidates choose display URLs when rendering.
  return { id: value.id, name: value.name || 'profile-image', url: `https://drive.google.com/thumbnail?id=${value.id}&sz=w1600` };
}

const drivePhases = ['Checking your photo', 'Preparing your photo', 'Working on your photo', 'Finishing up'];

export async function createDriveImage(file: File, personName: string, studentId: string) {
  return toast.track(async progress => {
    validateProfileImage(file);
    progress.step(1);
    const dataUrl = await fileAsDataUrl(file);
    return unwrap(await request({ action: 'create', name: personName, studentId, mimeType: file.type, dataUrl }, progress));
  }, 'Upload photo', 'Photo uploaded', drivePhases);
}

export async function updateDriveImage(fileId: string, file: File, personName: string, studentId: string) {
  return toast.track(async progress => {
    validateProfileImage(file);
    progress.step(1);
    const dataUrl = await fileAsDataUrl(file);
    return unwrap(await request({ action: 'update', fileId, name: personName, studentId, mimeType: file.type, dataUrl }, progress));
  }, 'Replace photo', undefined, drivePhases);
}

// Non-upload operations use the same transport phases without file preparation.
function driveRequest<T>(label: string, operation: (progress: OperationProgress) => Promise<T>) {
  return toast.track(progress => operation({ ...progress, step: phase => progress.step(phase - 2) }), label, undefined,
    ['Working on your photo', 'Finishing up']);
}
export type PhotoRemovalReason = 'failed-save' | 'replacement' | 'delete';

const removalMessages = {
  'failed-save': {
    title: 'Clean up unsaved photo',
    phases: ['Removing the upload after the save failed', 'Confirming cleanup'],
    success: 'Unsaved upload removed. Your previous photo was kept.',
    error: 'Could not clean up the unsaved upload. An extra copy may remain in Drive.',
  },
  replacement: {
    title: 'Remove replaced photo',
    phases: ['Removing the old photo after saving the new one', 'Confirming old photo removal'],
    success: 'Old photo removed. Your new photo is saved.',
    error: 'Your new photo is saved, but the old copy could not be removed from Drive.',
  },
  delete: {
    title: 'Delete photo',
    phases: ['Moving the photo to Drive trash', 'Confirming deletion'],
    success: 'Photo moved to Drive trash.',
    error: 'Could not delete the photo from Drive.',
  },
};

export async function deleteDriveImage(fileId: string, reason: PhotoRemovalReason = 'delete') {
  if (!fileId) return;
  const messages = removalMessages[reason];
  const progress = toast.start(messages.title, messages.phases);
  try {
    await request({ action: 'delete', fileId }, { ...progress, step: phase => progress.step(phase - 2) });
    progress.complete(messages.success);
  } catch (error) {
    progress.fail(error, messages.error);
    throw error;
  }
}
export async function getDriveImage(fileId: string) {
  return driveRequest('Load photo', async progress => unwrap(await request({ action: 'read', fileId }, progress)));
}
export async function listDriveImages() {
  return driveRequest('Load photos', async progress => {
    const payload = await request<{ files?: DriveImageResult[] }>({ action: 'list' }, progress);
    return payload.files || [];
  });
}

export function driveFileIdFromUrl(url: string | undefined) {
  if (!url) return '';
  let value = String(url).trim();
  // Some older records contain a Markdown link instead of the URL itself:
  // [https://drive.google.com/...](https://drive.google.com/...)
  const markdown = value.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);
  if (markdown) value = markdown[1];
  // Accept every URL shape returned by Apps Script/Drive, plus a bare file ID.
  try {
    const parsed = new URL(value);
    const queryId = parsed.searchParams.get('id') || parsed.searchParams.get('fileId');
    if (queryId) return queryId;
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];
  } catch {
    // The value may be a bare Drive ID; handled below.
  }
  const embedded = value.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]+)/);
  if (embedded) return embedded[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(value) ? value : '';
}

// This is the same public endpoint pattern used by PerkUp's drive-image
// function. It returns the bytes directly instead of relying on Drive's HTML
// thumbnail redirect, which is more reliable in an <img> element.
export function publicDriveImageUrl(url: string | undefined) {
  const id = driveFileIdFromUrl(url);
  return id ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w4000` : (url || '');
}

export function driveImageCandidates(url: string | undefined) {
  if (!url) return [];
  const id = driveFileIdFromUrl(url);
  if (!id) return [url];
  const encodedId = encodeURIComponent(id);
  return Array.from(new Set([
    `https://lh3.googleusercontent.com/d/${encodedId}=w4000`,
    `https://drive.google.com/uc?export=view&id=${encodedId}`,
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1600`,
    `https://drive.usercontent.google.com/download?id=${encodedId}&export=view&authuser=0`,
    url,
  ]));
}
