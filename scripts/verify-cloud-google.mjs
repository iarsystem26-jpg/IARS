import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const vercel = path.join(process.env.APPDATA, 'npm/node_modules/vercel/dist/vc.js');
const cli = path.resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const ref = 'iqnjyebkcetcmwammxff';
const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rmc-google-verification-'));
try {
  for (const target of ['production', 'preview', 'development']) {
    const filename = path.join(folder, `${target}.env`);
    const result = spawnSync(process.execPath, [vercel, 'env', 'pull', filename, '--environment', target, '--yes', '--scope', 'zekes-projects-eaf1f699'], { encoding: 'utf8', timeout: 120000, windowsHide: true });
    if (result.status !== 0) throw new Error(`Unable to read Vercel ${target} settings.`);
    const env = parseEnv(fs.readFileSync(filename, 'utf8'));
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_DRIVE_GAS_URL']) {
      if (env[name] !== process.env[name]) throw new Error(`Vercel ${target} ${name} does not match the local value.`);
    }
    console.log(`PASS Vercel ${target}: Supabase, Google client ID, image endpoint match`);
  }
  const secrets = spawnSync(cli, ['secrets', 'list', '--project-ref', ref], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (secrets.status !== 0) throw new Error('Unable to verify Supabase Edge Function environment.');
  const entries = JSON.parse(secrets.stdout).secrets;
  const digest = crypto.createHash('sha256').update(clientId).digest('hex');
  if (entries.find(item => item.name === 'GOOGLE_CLIENT_ID')?.value !== digest) throw new Error('Supabase GOOGLE_CLIENT_ID does not match.');
  console.log('PASS Supabase Edge Function GOOGLE_CLIENT_ID matches');
  const response = await fetch(`https://${ref}.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Frmcssg.vercel.app`, { redirect: 'manual' });
  if (response.status !== 302) throw new Error(`Google authorization endpoint returned ${response.status}.`);
  const authorization = new URL(response.headers.get('location'));
  if (authorization.hostname !== 'accounts.google.com' || authorization.searchParams.get('client_id') !== clientId || authorization.searchParams.get('redirect_uri') !== `https://${ref}.supabase.co/auth/v1/callback`) throw new Error('Google authorization redirect does not match the expected client/callback.');
  console.log('PASS Google authorization endpoint uses the correct client ID and callback');
  const invalid = await fetch(`https://${ref}.supabase.co/functions/v1/rmc-enroll`, { method: 'POST', headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'google', credential: 'invalid-test-token', nonce: 'a'.repeat(64) }) });
  if (invalid.status !== 400) throw new Error(`Invalid Google proof returned unexpected status ${invalid.status}.`);
  console.log('PASS deployed enrollment function rejects invalid Google proof');
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
  if (fs.existsSync('dist')) {
    for (const file of walk('dist').filter(file => /\.(js|html|json)$/.test(file))) if (fs.readFileSync(file, 'utf8').includes(process.env.GOOGLE_CLIENT_SECRET)) throw new Error('Google client secret found in the frontend build.');
    console.log('PASS Google client secret is absent from the frontend build');
  }
} finally {
  const resolved = path.resolve(folder);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('rmc-google-verification-')) throw new Error('Unexpected verification folder.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
