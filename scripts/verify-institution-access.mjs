import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generatePassword } from '../lib/passwordPolicy.ts';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const url = process.env.VITE_SUPABASE_URL;
if (new URL(url).hostname.split('.')[0] !== process.env.IARS_EXPECTED_PROJECT_REF) throw new Error('Verify the hub project first.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const admin = client(), student = client(), anonymous = client();
for (const [client, role] of [[admin,'admin'],[student,'student']]) {
  const account = accounts.find(a => a.role === role);
  const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ifError(login.error);
}
const slug = `verify-institution-${Date.now()}`;
let id;
try {
  assert.ok((await anonymous.from('rmc_institutions').select('id')).error, 'Anonymous registry reads must be denied');
  assert.ok((await student.from('rmc_institutions').insert({ slug, config: {} })).error, 'Student must not queue a project');
  assert.ok((await admin.from('rmc_institutions').insert({ slug, config: {}, status: 'active' })).error, 'Admin must not forge activation');
  assert.ok((await student.rpc('rmc_create_institution', { setup_config: { slug }, initial_password: generatePassword() })).error, 'Student cannot use the creation RPC');
  const insert = await admin.rpc('rmc_create_institution', { setup_config: { slug, name: 'Temporary access verification' }, initial_password: generatePassword() });
  assert.ifError(insert.error); id = insert.data;
  for (const viewer of [anonymous, student, admin]) assert.ok((await viewer.from('rmc_institution_credentials').select('*')).error, 'Initial passwords must not be browser-readable');
  const hidden = await student.from('rmc_institutions').select('id').eq('id', id);
  assert.ifError(hidden.error); assert.equal(hidden.data.length, 0, 'Students must not see registry contacts');
  assert.ok((await admin.from('rmc_institutions').update({ project_ref: 'abcdefghijklmnopqrst' }).eq('id', id)).error, 'Browser must not change project bindings');
  const activate = await admin.from('rmc_institutions').update({ status: 'active' }).eq('id', id).select('id');
  assert.ok(activate.error || !activate.data?.length, 'Browser must not publish a queued project');
  assert.ok((await admin.from('rmc_institution_routes').insert({ slug, project_ref: 'abcdefghijklmnopqrst', publishable_key: 'forged-public-key-1234567890' })).error, 'Browser must not publish routes');
  assert.ok((await admin.from('rmc_institution_branding').insert({ id: true, config: {} })).error, 'Browser must not replace verified project branding');
  const publicRoutes = await anonymous.from('rmc_institution_routes').select('slug'); assert.ifError(publicRoutes.error);
  console.log('PASS: authenticated admin setup, anonymous/student isolation, immutable bindings, service-only activation and branding.');
} finally {
  if (id) { const removal = await service.from('rmc_institutions').delete().eq('id', id); assert.ifError(removal.error); }
  await Promise.all([admin.auth.signOut(), student.auth.signOut()]);
}
