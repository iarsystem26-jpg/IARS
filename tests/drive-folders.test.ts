import fs from 'node:fs';
import vm from 'node:vm';
import { beforeEach, expect, it } from 'vitest';

let api: any;
let folders: Map<string, any>;
let role: string;
let status: string;
const iterator = (values: any[]) => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
function folder(id: string, parent?: string, description = '') {
  let name = id, trashed = false;
  const value: any = {
    getId: () => id, getName: () => name, setName: (next: string) => { name = next; },
    getDescription: () => description, setDescription: (next: string) => { description = next; },
    isTrashed: () => trashed, setTrashed: (next: boolean) => { trashed = next; },
    getUrl: () => `https://drive.google.com/drive/folders/${id}`,
    getParents: () => iterator(parent ? [folders.get(parent)] : []),
    getFolders: () => iterator([...folders.values()].filter(item => item.parent === id && !item.isTrashed())),
    getFiles: () => iterator(value.files || []),
    createFolder: (next: string) => { const item = folder(`new-${folders.size}`, id); item.setName(next); return item; },
    parent,
  };
  folders.set(id, value);
  return value;
}
beforeEach(() => {
  folders = new Map(); role = 'admin'; status = 'active';
  folder('unit'); folder('other-unit'); folder('custom', 'unit'); folder('nested', 'custom');
  api = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    DriveApp: { getFolderById: (id: string) => { if (!folders.has(id)) throw new Error('Missing'); return folders.get(id); } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify([{ id: 'admin-id', role_id: role, status }]) }) },
  });
  vm.runInContext(fs.readFileSync('google-apps-script/DriveFolders.gs', 'utf8'), api);
  api.driveRootId_ = () => 'unit';
  api.driveAuthConfig_ = () => ({ url: 'https://unit.supabase.co', key: 'public' });
});
const manage = (action: string, extra: Record<string, unknown> = {}, actor: string | null = 'admin-id') => api.manageDriveFolder_({ action: `folder_${action}`, accessToken: 'session', ...extra }, actor);

it('rejects anonymous callers, non-admin roles, inactive admins and forged actor IDs', () => {
  expect(() => manage('read', {}, null)).toThrow('Sign in');
  role = 'student'; expect(() => manage('read')).toThrow('Only active administrators');
  role = 'admin'; status = 'suspended'; expect(() => manage('create', { name: 'No' })).toThrow('Only active administrators');
  status = 'active'; expect(() => manage('read', {}, 'forged')).toThrow('Only active administrators');
});
it('confines reads and mutations to the configured unit, including nested folders', () => {
  expect(manage('read', { folderId: 'nested' }).folder.id).toBe('nested');
  for (const action of ['read', 'create', 'update', 'delete']) expect(() => manage(action, { folderId: 'other-unit', name: 'No' })).toThrow('outside your educational unit');
  expect(folders.get('other-unit').getName()).toBe('other-unit');
});
it('supports folder create, read, rename and trash while protecting roots and nonempty folders', () => {
  const created = manage('create', { folderId: 'nested', name: 'Archive' }).folder;
  expect(manage('read', { folderId: 'nested' }).folders[0].id).toBe(created.id);
  expect(manage('update', { folderId: created.id, name: '2026' }).folder.name).toBe('2026');
  expect(() => manage('delete', { folderId: 'custom' })).toThrow('Only empty folders');
  folders.get(created.id).files = [{}];
  expect(() => manage('delete', { folderId: created.id })).toThrow('Only empty folders');
  folders.get(created.id).files = [];
  manage('delete', { folderId: created.id });
  expect(folders.get(created.id).isTrashed()).toBe(true);
  expect(() => manage('read', { folderId: created.id })).toThrow('trash');
  for (const action of ['update', 'delete']) expect(() => manage(action, { name: 'No' })).toThrow('root');
});
it('creates category folders once and retains routing after rename', () => {
  const first = manage('setup').folders;
  expect(first.filter((item: any) => item.system)).toHaveLength(4);
  const photos = first.find((item: any) => item.name === 'Profile Photos');
  manage('update', { folderId: photos.id, name: 'Student pictures' });
  expect(api.categoryFolder_('photos').getId()).toBe(photos.id);
  expect(manage('setup').folders).toHaveLength(first.length);
  expect(() => manage('delete', { folderId: photos.id })).toThrow('Required upload folders');
  expect(() => api.categoryFolder_('../other-unit')).toThrow('Invalid upload category');
  expect(() => api.categoryFolder_('toString')).toThrow('Invalid upload category');
});
it('rejects empty, unsafe and oversized folder names', () => {
  for (const name of ['', ' ', '../escape', 'bad\\name', 'a'.repeat(101)]) expect(() => manage('create', { name })).toThrow('folder name');
});

it('refuses to fall back to a shared root when unit configuration is missing', () => {
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), api);
  expect(() => api.driveRootId_()).toThrow('UNIT_DRIVE_FOLDER_ID');
});
