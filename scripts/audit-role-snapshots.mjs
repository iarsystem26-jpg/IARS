// Read-only verification of configured demo accounts and saved role definitions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const result = [];
for (const account of accounts) {
  const client = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
  try {
    const login = await client.functions.invoke('rmc-login', { body: { identifier: account.username, password: account.password } });
    if (login.error) throw new Error(`Login: ${login.error.message}`);
    const session = await client.auth.setSession(login.data);
    if (session.error) throw new Error(`Session: ${session.error.message}`);
    const snapshot = await client.rpc('rmc_snapshot');
    if (snapshot.error) throw new Error(`Snapshot: ${snapshot.error.message}`);
    const profile = snapshot.data.profiles.find(p => p.uid === session.data.user.id);
    const role = snapshot.data.roles[profile?.role];
    const assignedNode = profile?.official_data?.assignment_node_id || profile?.school_data?.academic_assignment?.terminalGroupId;
    const expectedNode = { ssg: 'college_1789869610851', mayor: 'block_1789870005656', student: 'block_1789870005656' }[account.role];
    if (expectedNode) assert.equal(assignedNode, expectedNode, `${account.role} demo academic assignment`);
    if (account.role === 'mayor') {
      const demoStudent = accounts.find(row => row.role === 'student');
      assert.ok(snapshot.data.profiles.some(row => row.uid === demoStudent.uid), 'Mayor must see the demo student in the assigned class');
      assert.ok(snapshot.data.profiles.every(row => row.uid === profile.uid || row.role !== 'student' && row.role !== 'mayor'
        || row.school_data?.academic_assignment?.terminalGroupId === expectedNode), 'Mayor must not see students outside the assigned class');
    }
    result.push({ role: account.role, actualRole: profile?.role, status: profile?.account_status,
      assigned: Boolean(profile?.official_data?.assignment_node_id || profile?.school_data?.academic_assignment?.terminalGroupId),
      permissions: role?.permissions, visibleProfiles: snapshot.data.profiles.length,
      roleDefinitions: account.role === 'admin' ? snapshot.data.roles : undefined });
    console.log(`PASS ${account.role}: login and scoped snapshot`);
  } catch (error) {
    result.push({ role: account.role, error: error.message });
    console.log(`FAIL ${account.role}: ${error.message}`);
  }
}
fs.writeFileSync('.role-audit-snapshots.local.json', JSON.stringify(result, null, 2));
process.exitCode = result.some(row => row.error || row.actualRole !== row.role) ? 1 : 0;
