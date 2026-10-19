import { afterEach, expect, it, vi } from 'vitest';
import { retainedUploadFile, selectUploadFile, uploadFileBytes, uploadFileText } from './fileUploads';

afterEach(() => vi.restoreAllMocks());

it.each(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])('retains %s metadata and bytes without rereading the picker file', async type => {
  const original = new File([new Uint8Array([0, 1, 128, 255])], 'selected-file', { type, lastModified: 42 });
  const input = { files: [original], value: 'selected-file' } as unknown as HTMLInputElement;
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  expect(selectUploadFile(input)).toBe(original);
  expect(input.value).toBe('selected-file');
  const retained = await retainedUploadFile(original);
  expect(retained).not.toBe(original);
  expect(retained).toMatchObject({ name: original.name, type, size: 4, lastModified: 42 });
  expect(new Uint8Array(await uploadFileBytes(original))).toEqual(new Uint8Array([0, 1, 128, 255]));
  expect(read.mock.calls.filter(([file]) => file === original)).toHaveLength(1);
  expect(input.value).toBe('');
});

it('decodes retained CSV text including non-ASCII names', async () => {
  expect(await uploadFileText(new File(['Name\r\nJosé'], 'members.csv'))).toBe('Name\r\nJosé');
});

it('does not clear a newer selection when an earlier read completes', async () => {
  const first = new File(['one'], 'first.pdf');
  const second = new File(['two'], 'second.pdf');
  const input = { files: [first], value: 'first.pdf' } as unknown as HTMLInputElement;
  selectUploadFile(input);
  Object.assign(input, { files: [second], value: 'second.pdf' });
  await retainedUploadFile(first);
  expect(input.value).toBe('second.pdf');
});

it('rejects empty and oversized files before reading', async () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  await expect(retainedUploadFile(new File([], 'empty.pdf'))).rejects.toThrow('empty');
  await expect(retainedUploadFile(new File(['123'], 'large.pdf'), 2)).rejects.toThrow('smaller');
  expect(read).not.toHaveBeenCalled();
});

it('enforces a stricter size limit even when the file was already retained', async () => {
  const file = new File(['123'], 'document.pdf');
  await retainedUploadFile(file, 4);
  await expect(retainedUploadFile(file, 2)).rejects.toMatchObject({ code: 'FILE-001' });
  await expect(uploadFileBytes(file, 2)).rejects.toMatchObject({ code: 'FILE-001' });
  expect((await retainedUploadFile(file, 4)).size).toBe(3);
});

it.each(['error', 'abort'])('reports a picker %s and does not reread it on retry', async event => {
  vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function () {
    queueMicrotask(() => this[event === 'error' ? 'onerror' : 'onabort']?.(new ProgressEvent(event) as ProgressEvent<FileReader>));
  });
  const file = new File(['test'], 'document.pdf');
  const input = { files: [file], value: 'document.pdf' } as unknown as HTMLInputElement;
  selectUploadFile(input);
  await expect(retainedUploadFile(file)).rejects.toThrow('Save it to your device');
  await expect(retainedUploadFile(file)).rejects.toThrow('choose it again');
  expect(FileReader.prototype.readAsArrayBuffer).toHaveBeenCalledTimes(1);
});
