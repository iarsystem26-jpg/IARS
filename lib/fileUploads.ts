// Picker files may depend on temporary Android Gallery/provider permissions.
// Capture bytes at selection; consumers await the same copy before using them.
const copies = new WeakMap<File, Promise<File>>();

export function retainedUploadFile(file: File, maxBytes = 5 * 1024 * 1024): Promise<File> {
  if (file.size > maxBytes) {
    const failure = Promise.reject<File>(Object.assign(new Error(`Choose a file of ${maxBytes / 1024 / 1024} MB or smaller.`), { code: 'FILE-001' }));
    void failure.catch(() => undefined);
    return failure;
  }
  const existing = copies.get(file);
  if (existing) return existing;
  const copy = new Promise<File>((resolve, reject) => {
    if (!file.size) { reject(Object.assign(new Error('This file is empty. Choose another file.'), { code: 'FILE-003' })); return; }
    if (file.size > maxBytes) { reject(Object.assign(new Error(`Choose a file of ${maxBytes / 1024 / 1024} MB or smaller.`), { code: 'FILE-001' })); return; }
    const reader = new FileReader();
    const fail = () => reject(Object.assign(new Error('Could not read this file. Save it to your device and choose it again.', { cause: reader.error }), { code: 'FILE-003' }));
    reader.onerror = fail;
    reader.onabort = fail;
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength !== file.size) { fail(); return; }
      resolve(new File([reader.result], file.name, { type: file.type, lastModified: file.lastModified }));
    };
    try { reader.readAsArrayBuffer(file); }
    catch (cause) { reject(Object.assign(new Error('Could not read this file. Save it to your device and choose it again.', { cause }), { code: 'FILE-003' })); }
  });
  copies.set(file, copy);
  // A user can cancel the form without consuming the selection.
  void copy.catch(() => undefined);
  return copy;
}

export async function uploadFileBytes(file: File, maxBytes = 10 * 1024 * 1024): Promise<ArrayBuffer> {
  const retained = await retainedUploadFile(file, maxBytes);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reader.onabort = () => reject(Object.assign(new Error('Could not read this file. Save it to your device and choose it again.'), { code: 'FILE-003' }));
    reader.readAsArrayBuffer(retained);
  });
}

export async function uploadFileText(file: File): Promise<string> {
  return new TextDecoder().decode(await uploadFileBytes(file));
}

export function selectUploadFile(input: HTMLInputElement, maxBytes?: number): File | undefined {
  const file = input.files?.[0];
  if (!file) return undefined;
  const copy = retainedUploadFile(file, maxBytes);
  // Keep the input alive until the read settles; allow reselecting the same file.
  void copy.finally(() => { if (input.files?.[0] === file) input.value = ''; }).catch(() => undefined);
  return file;
}
