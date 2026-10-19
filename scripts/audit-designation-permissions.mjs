import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { testStudentId } from './test-student-id.mjs';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = client();
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
const prefix = `audit-designation-${Date.now()}`;
const nodes = [], users = [];
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const command = (who, action, args) => who.rpc('rmc_command', { action, args });
const password = `${crypto.randomUUID()}Aa!`;
try {
  checked(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  for (const [suffix, parent, type] of [['campus', null, 'education_unit'], ['section', 'campus', 'section']]) {
    const id = `${prefix}-${suffix}`;
    checked(await command(admin, 'addSchoolNode', [parent ? `${prefix}-${parent}` : null, { id, name: `${prefix} ${suffix}`, type }]));
    nodes.push(id);
  }
  for (const role of ['ssg', 'student']) {
    const node = `${prefix}-${role === 'ssg' ? 'campus' : 'section'}`;
    const profile = { name: `${prefix} ${role}`, username: `${prefix}-${role}`, email: `${prefix}-${role}@example.test`,
      student_id: testStudentId(), role, school_data: { academic_assignment: { terminalGroupId: node } },
      ...(role === 'ssg' ? { official_data: { body: 'SSG', assignment_node_id: node } } : {}) };
    const response = checked(await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } }));
    assert.ok(response.ids?.length, 'Account provisioning did not return a user ID.');
    users.push(...response.ids);
  }
  const ssg = client();
  checked(await ssg.auth.signInWithPassword({ email: `${prefix}-ssg@example.test`, password }));
  checked(await command(ssg, 'assignSectionMayor', [users[1], `${prefix}-section`, 'Temporary section']));
  console.log('PASS assigned SSG can appoint a student as Mayor within scope');
  checked(await command(ssg, 'assignRole', [users[1], 'student', `${prefix}-section`]));
  const restored = checked(await service.from('rmc_profiles').select('role_id,node_id,profile').eq('id', users[1]).single());
  assert.equal(restored.role_id, 'student');
  assert.equal(restored.node_id, `${prefix}-section`);
  assert.equal(restored.profile.official_data, undefined, 'Regular must remove Mayor designation metadata');
  const forbidden = await command(ssg, 'assignRole', [users[1], 'ossa']);
  assert.ok(forbidden.error, 'Designation access must not allow assigning staff roles');
  console.log('PASS assigned SSG can return a Mayor to Student while staff role changes remain protected');
  fs.writeFileSync('.role-audit-designation.local.json', JSON.stringify({ mayorAssignment: 'passed', regularAssignment: 'passed', staffRoleEscalation: 'blocked' }, null, 2));
  await ssg.auth.signOut();
} finally {
  for (const id of users) checked(await service.auth.admin.deleteUser(id));
  for (const id of [...nodes].reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
  await admin.auth.signOut();
  console.log('Temporary designation verification accounts and units removed.');
}
