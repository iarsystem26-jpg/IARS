import { testStudentId } from './test-student-id.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.server.local');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const file = '.demo-accounts.local';
const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const accounts = [
  ['admin', 'Regal Admin'], ['ossa', 'Dr. Evelyn Santos (OSSA Director)'],
  ['ssg', 'Officer Juan'], ['mayor', 'Maria Clara'], ['student', 'Pedro Penduko'],
];
for (const [role, name] of accounts) {
  const email = `${role}@test.com`;
  const { data: existing, error: lookupError } = await client.from('rmc_profiles').select('id').eq('profile->>email', email).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) { console.log(`${role}: preserved existing account`); continue; }
  const { error: reservationError } = await client.rpc('rmc_reserve_test_account', { email });
  if (reservationError) throw reservationError;
  const password = crypto.randomBytes(24).toString('base64url');
  const profile = { name, username: role, email, student_id: testStudentId(), photo_url: '', role: 'student', account_status: 'pending', school_data: { type: 'College', level: '', section: '' } };
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { profile }, app_metadata: { rmc_provisioned: true } });
  if (error) throw error;
  profile.uid = data.user.id; profile.role = role; profile.account_status = 'active';
  const { error: profileError } = await client.from('rmc_profiles').update({ profile, role_id: role, status: 'active', is_test_account: true }).eq('id', data.user.id);
  if (profileError) { await client.auth.admin.deleteUser(data.user.id); throw profileError; }
  const { error: applicationError } = await client.from('rmc_applications').delete().eq('id', data.user.id);
  if (applicationError) throw applicationError;
  saved.push({ role, email, username: role, password, uid: data.user.id });
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  console.log(`${role}: created Auth account; credentials saved privately to ${file}`);
}
console.log('No directory units, students beyond the five test identities, events, attendance, excuses, or sanctions were seeded.');
