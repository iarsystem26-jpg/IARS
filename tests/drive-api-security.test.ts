import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const capability = 'a'.repeat(72);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let api: any, files: Map<string, any>, properties: Map<string, string>;
function file(id: string, metadata: Record<string, string> = {}) {
  let description = JSON.stringify(metadata);
  return { getId: () => id, getName: () => 'Profile.png', getMimeType: () => 'image/png',
    getDescription: () => description, setDescription: (value: string) => { description = value; },
    getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return { getId: () => '1T2wZaDYshXpUb_LQihfO8dILaas2QbjN' }; } }; },
    setSharing: () => {}, setTrashed: (value: boolean) => { files.delete(id); }, setName: () => {} };
}
const post = (body: unknown) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }));

function keepAliveHarness(status = 200, body = '[]') {
  const triggers: any[] = [{ getHandlerFunction: () => 'otherMaintenance' }];
  const fetch = vi.fn(() => ({ getResponseCode: () => status, getContentText: () => body }));
  const everyHours = vi.fn();
  api.console = { log: vi.fn() };
  api.UrlFetchApp = { fetch };
  api.ScriptApp = {
    getProjectTriggers: () => [...triggers],
    newTrigger: (handler: string) => ({ timeBased: () => ({ everyHours: (hours: number) => {
      everyHours(hours);
      return { create: () => triggers.push({ getHandlerFunction: () => handler }) };
    } }) }),
    deleteTrigger: (trigger: any) => triggers.splice(triggers.indexOf(trigger), 1),
  };
  return { triggers, fetch, everyHours };
}

beforeEach(() => {
  files = new Map(); properties = new Map([['SUPABASE_URL', 'https://test.supabase.co'], ['SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test']]);
  let created = 0;
  api = vm.createContext({
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ setMimeType: () => text }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name: string) => properties.get(name), setProperty: (name: string, value: string) => properties.set(name, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algorithm: string, value: string) => Array.from(createHash('sha256').update(value).digest()),
      base64Decode: (value: string) => Array.from(Buffer.from(value, 'base64')), newBlob: () => ({ setName: () => ({}) }) },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'public' }, Permission: { VIEW: 'view' }, getFileById: (id: string) => { const result = files.get(id); if (!result) throw new Error('Not found'); return result; },
      getFolderById: () => ({ createFile: () => { const item = file(`created-${++created}`); files.set(item.getId(), item); return item; },
        getFiles: () => { const iterator = files.values(); let next = iterator.next(); return { hasNext: () => !next.done, next: () => { const item = next.value; next = iterator.next(); return item; } }; } }) },
    UrlFetchApp: { fetch: (url: string, options: any) => {
      const token = options.headers.Authorization.slice(7);
      const identity = token === 'owner' || token === 'mfa-required' ? owner : outsider;
      return { getResponseCode: () => token === 'forged' ? 401 : 200,
        getContentText: () => JSON.stringify(url.includes('/auth/') ? { id: identity } : token === 'mfa-required' ? [] : [{ id: identity }]) };
    } },
  });
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), api);
});

it('blocks public inventories and unauthenticated modification of existing images', () => {
  files.set('private', file('private', { owner, capability: hash(capability) }));
  expect(JSON.parse(api.doGet({ parameter: { action: 'list' } })).success).toBe(false);
  for (const action of ['read', 'update', 'delete', 'list']) expect(post({ action, fileId: 'private' }).success).toBe(false);
  expect(files.has('private')).toBe(true);
});
it('rejects forged sessions, incomplete MFA, another owner, and incorrect capabilities', () => {
  files.set('private', file('private', { owner, capability: hash(capability) }));
  for (const accessToken of ['forged', 'mfa-required', 'outsider']) expect(post({ action: 'delete', fileId: 'private', accessToken }).success).toBe(false);
  expect(post({ action: 'delete', fileId: 'private', managementToken: 'b'.repeat(72) }).success).toBe(false);
  expect(files.has('private')).toBe(true);
});
it('allows only the owner or the upload capability to remove a managed file', () => {
  for (const authorization of [{ accessToken: 'owner' }, { managementToken: capability }]) {
    files.set('private', file('private', { owner, capability: hash(capability) }));
    expect(post({ action: 'delete', fileId: 'private', ...authorization }).success).toBe(true);
    expect(files.has('private')).toBe(false);
  }
});
it('retains anonymous registration uploads with content validation and an unexposed capability', () => {
  const dataUrl = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
  const upload = post({ action: 'create', dataUrl, mimeType: 'image/png', managementToken: capability });
  expect(upload.success).toBe(true);
  expect(upload).not.toHaveProperty('managementToken');
  expect(JSON.parse(files.get(upload.id).getDescription())).toEqual({ owner: null, capability: hash(capability) });
  expect(post({ action: 'delete', fileId: upload.id }).success).toBe(false);
  expect(post({ action: 'delete', fileId: upload.id, managementToken: capability }).success).toBe(true);
  expect(post({ action: 'create', dataUrl: 'data:image/png;base64,PHNjcmlwdD4=', mimeType: 'image/png', managementToken: capability }).success).toBe(false);
});
it('never lets an authenticated user claim legacy images with user-supplied identity fields', () => {
  files.set('legacy', file('legacy'));
  expect(post({ action: 'delete', fileId: 'legacy', accessToken: 'owner', name: 'Owner', studentId: owner }).success).toBe(false);
});
it('limits anonymous storage consumption and scopes authenticated inventories', () => {
  properties.set('ANONYMOUS_DAILY_UPLOAD_LIMIT', '1');
  const payload = { action: 'create', dataUrl: 'data:image/png;base64,iVBORw0KGgoA', mimeType: 'image/png', managementToken: capability };
  expect(post(payload).success).toBe(true);
  expect(post(payload).success).toBe(false);
  files.set('mine', file('mine', { owner })); files.set('theirs', file('theirs', { owner: outsider }));
  expect(post({ action: 'list', accessToken: 'owner' }).files.map((item: any) => item.id)).toEqual(['mine']);
});

it('pings the database using only the publishable key and records a successful empty result', () => {
  const { fetch } = keepAliveHarness();
  api.pingSupabase();
  expect(fetch).toHaveBeenCalledWith('https://test.supabase.co/rest/v1/rmc_nodes?select=id&limit=1', {
    method: 'get', headers: { apikey: 'sb_publishable_test' }, muteHttpExceptions: true,
  });
  expect(properties.get('SUPABASE_KEEPALIVE_LAST_SUCCESS')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it('reinstalling keeps one six-hour ping trigger and preserves unrelated triggers', () => {
  const { triggers, everyHours } = keepAliveHarness();
  api.installSupabaseKeepAlive();
  api.installSupabaseKeepAlive();
  expect(everyHours.mock.calls).toEqual([[6], [6]]);
  expect(triggers.map(trigger => trigger.getHandlerFunction())).toEqual(['otherMaintenance', 'pingSupabase']);
  api.removeSupabaseKeepAlive();
  expect(triggers.map(trigger => trigger.getHandlerFunction())).toEqual(['otherMaintenance']);
});

it('failed setup preserves the existing schedule and last successful timestamp without leaking responses', () => {
  const { triggers } = keepAliveHarness(503, 'sensitive response');
  triggers.push({ getHandlerFunction: () => 'pingSupabase' });
  properties.set('SUPABASE_KEEPALIVE_LAST_SUCCESS', 'previous');
  expect(() => api.installSupabaseKeepAlive()).toThrow('HTTP 503');
  expect(triggers).toHaveLength(2);
  expect(properties.get('SUPABASE_KEEPALIVE_LAST_SUCCESS')).toBe('previous');
  expect(api.console.log).not.toHaveBeenCalled();
});

it('rejects missing configuration and unexpected ping responses', () => {
  const { fetch } = keepAliveHarness(200, '{}');
  expect(() => api.pingSupabase()).toThrow('unexpected response');
  expect(properties.has('SUPABASE_KEEPALIVE_LAST_SUCCESS')).toBe(false);
  fetch.mockClear();
  properties.delete('SUPABASE_PUBLISHABLE_KEY');
  expect(() => api.installSupabaseKeepAlive()).toThrow('Configure SUPABASE_URL');
  expect(fetch).not.toHaveBeenCalled();
});
