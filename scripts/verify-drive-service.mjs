import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.loadEnvFile('.env.local');
const url = process.env.VITE_GOOGLE_DRIVE_GAS_URL;
assert.ok(url, 'Configure the Drive endpoint first.');
async function post(body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `GAS returned HTTP ${response.status}.`);
  return response.json();
}
for (const action of ['folder_read', 'folder_setup', 'folder_create', 'folder_update', 'folder_delete']) {
  assert.equal((await post({ action, name: 'Must not be created' })).success, false, 'Anonymous folder management must be denied.');
}
console.log('PASS live folder endpoints reject anonymous management.');
const managementToken = crypto.randomUUID() + crypto.randomUUID();
let fileId;
try {
  const result = await post({ action: 'create', name: 'IARS service verification', studentId: `verification-${Date.now()}`, category: 'photos', managementToken, mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=' });
  assert.equal(result.success, true, result.error);
  fileId = result.id;
  assert.ok(fileId);
  assert.equal((await post({ action: 'read', fileId, managementToken })).success, true);
  assert.equal((await post({ action: 'delete', fileId, managementToken: crypto.randomUUID() + crypto.randomUUID() })).success, false);
  assert.equal((await post({ action: 'update', fileId, name: 'IARS verified image', studentId: 'verification', managementToken })).success, true);
  console.log('PASS live upload, protected read, rename and incorrect-token rejection.');
} finally {
  if (fileId) {
    assert.equal((await post({ action: 'delete', fileId, managementToken })).success, true);
    console.log('PASS verification image moved to Drive trash.');
  }
}
