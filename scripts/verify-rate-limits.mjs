import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const url = process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const user = createClient(url, key, options);
const check = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(item => item.role === 'admin');
assert.ok(account, 'A prepared demo administrator is needed for the account limiter smoke check.');
const signedIn = check(await user.auth.signInWithPassword({ email: account.email, password: account.password }));
const bucket = `edge:accounts:true:${hash(`user:${signedIn.user.id}`)}`;
fs.writeFileSync('artifacts/rate-limit-test-subject.local.json', JSON.stringify({ uid: signedIn.user.id, bucket }));
const apiCheck = process.argv.includes('--expect-api-429');
const response = await fetch(`${url}${apiCheck ? '/rest/v1/rpc/rmc_snapshot' : '/functions/v1/rmc-accounts'}`, {
  method: 'POST', headers: { apikey: key, Authorization: `Bearer ${signedIn.session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(apiCheck ? {} : { action: 'access' }),
});
if (process.argv.includes('--expect-429') || apiCheck) {
  assert.equal(response.status, 429, 'Verified account budget must reject before account listing');
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
  console.log(`PASS deployed ${apiCheck ? 'Data API' : 'Edge Function'} returns HTTP 429 and Retry-After`);
} else {
  assert.equal(response.status, 200, 'Normal account operation should work');
  check(await user.rpc('rmc_snapshot'));
  check(await createClient(url, key, options).rpc('rmc_public_organizations'));
  console.log('PASS normal authenticated account operation, snapshot, and public organization RPC');
  const malformed = await fetch(`${url}/functions/v1/rmc-login`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: 'invalid-json',
  });
  assert.equal(malformed.status, 401, 'Normal login validation should remain available');
  console.log('PASS deployed login request passes the limiter and reaches validation');
}
await user.auth.signOut();
