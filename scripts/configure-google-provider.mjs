import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const clientId = process.env.VITE_GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
if (!clientId?.endsWith('.apps.googleusercontent.com') || !clientSecret) throw new Error('Google OAuth credentials are required in the local environment files.');
const cli = path.resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rmc-google-provider-'));
const directory = path.join(folder, 'supabase'); fs.mkdirSync(directory);
const configFile = path.join(directory, 'config.toml');
const config = `project_id = "iqnjyebkcetcmwammxff"
[auth]
site_url = "https://rmcssg.vercel.app"
additional_redirect_urls = ["https://rmcssg.vercel.app", "https://rmcssg.vercel.app/", "http://localhost:3000", "http://localhost:3000/**", "http://127.0.0.1:3000", "http://127.0.0.1:3000/**"]
[auth.external.google]
enabled = true
client_id = "${clientId}"
secret = "env(GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
`;
fs.writeFileSync(configFile, config, { mode: 0o600 });
const scrub = value => String(value || '').split(clientSecret).join('[redacted Google secret]').replace(/GOCSPX-[A-Za-z0-9_-]+/g, '[redacted Google secret]');
try {
  const command = ['config', process.argv.includes('--apply') ? 'push' : 'diff', '--workdir', folder, '--project-ref', 'iqnjyebkcetcmwammxff'];
  if (process.argv.includes('--apply')) command.push('--yes');
  const result = spawnSync(cli, command, { env: process.env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  console.log(scrub(result.stdout)); console.log(scrub(result.stderr));
  if (result.status !== 0) throw new Error(`Google provider configuration exited with code ${result.status}.`);
  const verificationArgs = ['-NoProfile', '-File', path.resolve('scripts/configure-supabase-google.ps1')];
  if (process.argv.includes('--apply')) verificationArgs.push('-Apply');
  const verification = spawnSync('powershell.exe', verificationArgs, { env: process.env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  console.log(scrub(verification.stdout)); console.log(scrub(verification.stderr));
  if (verification.status !== 0) throw new Error('Supabase Google credential verification failed.');
} finally {
  const resolved = path.resolve(folder);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('rmc-google-provider-')) throw new Error('Unexpected temporary configuration path.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
