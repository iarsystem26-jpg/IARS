import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const admin = client();
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(account => account.role === 'admin');
const prefix = `verify-accounts-${Date.now()}`;
const ids = [], nodes = [];
const password = `${crypto.randomUUID()}Aa!`;
async function checked(result) {
  if (result.error) {
    const body = await result.error.context?.json?.().catch(() => null);
    throw new Error(body?.error || result.error.message);
  }
  return result.data;
}
try {
  await checked(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  for (const [suffix, parent, type] of [['campus', null, 'education_unit'], ['department', 'campus', 'department']]) {
    const id = `${prefix}-${suffix}`;
    await checked(await admin.rpc('rmc_command', { action: 'addSchoolNode', args: [parent ? `${prefix}-${parent}` : null, { id, name: `${prefix} ${suffix}`, type }] }));
    nodes.push(id);
  }
  const deniedAnon = await client().rpc('rmc_provision_check', { person: { role: 'admin' } });
  assert.ok(deniedAnon.error, 'Anonymous callers must not provision accounts');
  for (const role of ['admin', 'ossa', 'ossa_staff', 'ssg']) {
    const roleIds = [];
    for (const index of [1, 2]) {
      const identity = `${prefix}-${role}-${index}`;
      const assignment = role === 'admin' ? undefined : `${prefix}-${'campus'}`;
      const profile = { name: identity, email: `${identity}@example.test`, username: identity, student_id: testStudentId(), role,
        school_data: { type: 'College', level: 'Administration', section: '' },
        ...(assignment ? { official_data: { body: role === 'ssg' ? 'SSG' : 'OSSA', assignment_node_id: assignment } } : {}) };
      const result = await checked(await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } }));
      ids.push(...result.ids); roleIds.push(...result.ids);
      const who = client();
      await checked(await who.auth.signInWithPassword({ email: profile.email, password }));
      if (role !== 'admin') {
        for (const privilegedRole of ['admin', 'ossa', 'ossa_staff']) {
          const denied = await who.rpc('rmc_provision_check', { person: { ...profile, role: privilegedRole } });
          assert.ok(denied.error, `${role} must not provision ${privilegedRole}`);
        }
      }
      await who.auth.signOut();
    }
    const rows = await checked(await service.from('rmc_profiles').select('id,role_id,status,node_id').in('id', roleIds));
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map(row => row.id)).size, 2);
    assert.ok(rows.every(row => row.role_id === role && row.status === 'active'));
    if (role === 'admin') assert.ok(rows.every(row => row.node_id === null));
    else assert.ok(rows.every(row => row.node_id === `${prefix}-${'campus'}`));
    console.log(`PASS two distinct ${role} accounts created, persisted, and signed in`);
  }
  const snapshot = await checked(await admin.rpc('rmc_snapshot'));
  assert.equal(snapshot.profiles.filter(profile => ids.includes(profile.uid)).length, 8);
  console.log('PASS all eight accounts visible together in the admin snapshot');
  const access = await checked(await admin.functions.invoke('rmc-accounts', { body: { action: 'access', data: {} } }));
  assert.equal(access.users.filter(user => ids.includes(user.id) && user.last_sign_in_at).length, 8);
  console.log('PASS sign-in activity available for all eight managed accounts');
} finally {
  for (const id of ids) await checked(await service.auth.admin.deleteUser(id));
  for (const id of [...nodes].reverse()) await checked(await service.from('rmc_nodes').delete().eq('id', id));
  if (ids.length || nodes.length) await checked(await service.from('rmc_audit').delete().in('target', [...ids, ...nodes]));
  await admin.auth.signOut();
  console.log('Cleaned up only this verification run’s accounts and units.');
}
