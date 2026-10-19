import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = client();
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(account => account.role === 'admin');
const check = result => { if (result.error) throw result.error; return result.data; };
let uid;
try {
  check(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  const name = `notice-${Date.now()}`;
  const email = `${name}@example.test`;
  const password = crypto.randomBytes(24).toString('base64url');
  const nodes = check(await service.from('rmc_nodes').select('id,parent_id,data'));
  const section = nodes.find(node => node.data.type === 'section');
  assert.ok(section, 'A section is required for the temporary verification account');
  const path = [];
  for (let node = section; node; node = nodes.find(parent => parent.id === node.parent_id)) path.unshift(node.id);
  const profile = { name, email, username: name, student_id: testStudentId(), role: 'student', school_data: { type: 'College', academic_assignment: { campusId: path[0], terminalGroupId: section.id, nodePathIds: path } } };
  const result = await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } });
  if (result.error) throw new Error(JSON.stringify(await result.error.context?.json?.()) || result.error.message);
  const created = check(result);
  if (created.error) throw new Error(created.error);
  uid = created.ids[0];
  const first = client();
  check(await first.auth.signInWithPassword({ email, password }));
  assert.equal(check(await first.auth.getUser()).user.user_metadata.approval_notice_seen_at, undefined);
  const timestamp = new Date().toISOString();
  check(await first.auth.updateUser({ data: { approval_notice_seen_at: timestamp } }));
  const second = client();
  check(await second.auth.signInWithPassword({ email, password }));
  const saved = check(await second.auth.getUser()).user;
  assert.equal(saved.user_metadata.approval_notice_seen_at, timestamp);
  assert.equal(saved.user_metadata.profile.name, name, 'Other metadata must remain intact');
  console.log('PASS approval timestamp persists across separate client logins and preserves existing metadata');
} finally {
  if (uid) { check(await service.auth.admin.deleteUser(uid)); console.log('PASS temporary verification account removed'); }
}
