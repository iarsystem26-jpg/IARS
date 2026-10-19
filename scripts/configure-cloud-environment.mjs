import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { validatePublicEnvironment } from '../security.config.mjs';

// Read only the named files, and send values through stdin/files rather than
// placing credentials in shell commands or printing them to the terminal.
process.loadEnvFile('.env.local');
if (fs.existsSync('.env.server.local')) process.loadEnvFile('.env.server.local');
const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
if (project.projectName !== 'iars') throw new Error('Expected the iars Vercel project. Link the correct project first.');
const supabaseRef = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (supabaseRef !== 'hmgadsnbdgrtojkoranv') throw new Error('Expected the IARS Supabase project.');
validatePublicEnvironment(process.env);
if (new URL(process.env.VITE_SUPABASE_URL).hostname !== `${supabaseRef}.supabase.co`) throw new Error('The frontend Supabase URL does not match the linked project.');

const vercelCli = process.env.RMC_VERCEL_CLI || path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'vercel', 'dist', 'vc.js');
const supabaseCli = path.join('node_modules', '@supabase', process.platform === 'win32' ? 'cli-windows-x64' : 'cli-linux-x64', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase');
if (!fs.existsSync(vercelCli)) throw new Error('Set RMC_VERCEL_CLI to the installed Vercel CLI JavaScript entrypoint.');
const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_PASSKEY_RP_ID', 'VITE_SHOW_TEST_ACCOUNTS', 'VITE_GOOGLE_DRIVE_GAS_URL', 'VITE_GOOGLE_CLIENT_ID'];
for (const name of names) {
  const value = process.env[name]?.trim();
  if (!value) { console.log(`SKIP ${name}: no local value`); continue; }
  const result = spawnSync(process.execPath, [vercelCli, 'env', 'add', name, 'production,preview,development', '--force', '--yes', '--no-sensitive', '--scope', 'zekes-projects-eaf1f699'], {
    input: value, encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  if (result.status !== 0) {
    let details = `${result.stderr || ''}\n${result.stdout || ''}`;
    for (const secret of Object.values(process.env)) if (secret.length > 8) details = details.split(secret).join('[redacted]');
    throw new Error(`Unable to configure ${name} on Vercel (exit ${result.status}): ${details}`);
  }
  console.log(`SET Vercel ${name}: production, preview, development`);
}

const googleId = process.env.VITE_GOOGLE_CLIENT_ID?.trim();
if (googleId) {
  if (!googleId.endsWith('.apps.googleusercontent.com')) throw new Error('VITE_GOOGLE_CLIENT_ID must be a Google OAuth client ID.');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rmc-cloud-secrets-'));
  const filename = path.join(folder, 'google.env');
  try {
    fs.writeFileSync(filename, `GOOGLE_CLIENT_ID=${googleId}\n`, { mode: 0o600 });
    const result = spawnSync(supabaseCli, ['secrets', 'set', '--project-ref', supabaseRef, '--env-file', filename], { encoding: 'utf8', timeout: 120000, windowsHide: true });
    if (result.status !== 0) throw new Error(`Unable to configure Supabase GOOGLE_CLIENT_ID (exit ${result.status}).`);
    console.log('SET Supabase GOOGLE_CLIENT_ID');
  } finally {
    fs.rmSync(filename, { force: true }); fs.rmdirSync(folder);
  }
} else console.log('PENDING Google OAuth client ID: add VITE_GOOGLE_CLIENT_ID to .env.local');
console.log(process.env.GOOGLE_CLIENT_SECRET ? 'Google provider client secret is available locally; provider configuration is separate.' : 'PENDING Google provider client secret: add GOOGLE_CLIENT_SECRET to .env.server.local');
console.log('Supabase supplies its built-in server secrets. Only allowlisted VITE_ values were sent to Vercel.');
