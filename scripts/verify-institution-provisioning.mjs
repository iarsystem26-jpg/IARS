import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

// Opt-in cloud integration test: creates one billable temporary project.
// The operator wrapper supplies its management credential on stdin, never in arguments.
let input = ''; for await (const chunk of process.stdin) input += chunk;
const { managementToken } = JSON.parse(input.replace(/^\uFEFF/, ''));
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const hubUrl = process.env.VITE_SUPABASE_URL;
const hubRef = new URL(hubUrl).hostname.split('.')[0];
if (hubRef !== process.env.IARS_EXPECTED_PROJECT_REF) throw new Error('Verify the hub project first.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const hub = createClient(hubUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const owner = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const slug = `provisioning-check-${Date.now()}`;
let id, ref, logoPath, browser;
const checked = result => { assert.ifError(result.error); return result.data; };
try {
  logoPath = `${owner.uid || owner.id || crypto.randomUUID()}/${slug}.png`;
  checked(await hub.storage.from('institution-logos').upload(logoPath, fs.readFileSync('public/iars-icon.png'), { contentType: 'image/png' }));
  const ownerProfile = checked(await hub.from('rmc_profiles').select('id').eq('profile->>email', owner.email).single());
  const config = { slug, name: 'Temporary Provisioning Check', shortName: 'CHECK', legalName: 'Temporary Verification Only', address: 'Verification only', supportEmail: 'support@example.invalid', privacyEmail: 'privacy@example.invalid', adminName: 'Temporary Administrator', adminEmail: `check-${Date.now()}@example.invalid`, adminUsername: 'verification-admin', logoUrl: hub.storage.from('institution-logos').getPublicUrl(logoPath).data.publicUrl, primaryColor: '#6d28d9', accentColor: '#eab308', theme: 'custom', appearance: 'dark' };
  const request = checked(await hub.from('rmc_institutions').insert({ slug, config, created_by: ownerProfile.id }).select('id').single()); id = request.id;
  let last = '';
  let active;
  for (let attempt = 0; attempt < 180; attempt++) {
    const record = checked(await hub.from('rmc_institutions').select('*').eq('id', id).single());
    ref = record.project_ref;
    const status = `${record.status}: ${record.stage}`;
    if (status !== last) {
      console.log(status); last = status;
      if (record.status === 'failed') console.log('Provisioning is paused for operator repair. The temporary project is retained until this verification finishes.');
    }
    if (record.status === 'active') { active = record; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.ok(active, 'Timed out waiting for the provisioning worker');
  const route = checked(await hub.from('rmc_institution_routes').select('*').eq('slug', slug).single());
  assert.notEqual(route.project_ref, hubRef);
  const targetUrl = `https://${ref}.supabase.co`;
  const target = createClient(targetUrl, route.publishable_key, options);
  const firstAccess = new URL(active.bootstrap_url);
  const recovered = checked(await target.auth.verifyOtp({ type: 'recovery', token_hash: firstAccess.searchParams.get('token') }));
  assert.ok(recovered.session);
  const password = crypto.randomBytes(30).toString('base64url');
  checked(await target.auth.updateUser({ password }));
  const targetProfile = checked(await target.from('rmc_profiles').select('role_id').eq('id', recovered.user.id).single());
  assert.equal(targetProfile.role_id, 'admin');
  checked(await target.rpc('rmc_snapshot'));
  const login = await fetch(`${targetUrl}/functions/v1/rmc-login`, { method: 'POST', headers: { apikey: route.publishable_key, 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: config.adminUsername, password }) });
  const loginData = await login.json(); assert.equal(login.status, 200); assert.ok(loginData.access_token);
  const denied = await fetch(`${hubUrl}/rest/v1/rmc_profiles?select=id`, { headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${loginData.access_token}` } });
  assert.ok([401,403].includes(denied.status), 'Institution token must not access hub records');
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:3000/?institution=${slug}#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier'); await page.type('#landing-login-identifier', config.adminUsername); await page.type('#landing-login-password', password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => !document.querySelector('#landing-login-identifier') && document.querySelector('main'), { timeout: 45000 });
  await page.waitForSelector('main h1', { timeout: 45000 });
  const branding = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), primary: document.documentElement.style.getPropertyValue('--palette-brand-500'), logos: [...document.querySelectorAll('img[alt="Institution logo"]')].map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth > 0 })), keys: Object.keys(localStorage).filter(key => key.includes(':auth')) }));
  assert.equal(branding.dark, true); assert.equal(branding.primary, '109 40 217');
  assert.ok(branding.logos.length && branding.logos.every(logo => logo.src.startsWith(targetUrl) && logo.loaded));
  assert.ok(branding.keys.some(key => key.includes(slug) && key.includes(encodeURIComponent(targetUrl))));
  assert.deepEqual(errors, []);
  fs.mkdirSync('artifacts/institutions', { recursive: true }); await page.screenshot({ path: 'artifacts/institutions/isolated-dashboard.png', fullPage: true });
  console.log('PASS: real project creation, all migrations, initial administrator recovery/login, institution branding, namespaced session, and cross-project token rejection.');
} finally {
  if (browser) await browser.close();
  // Only delete the uniquely named project created for this test, after verifying its binding.
  if (id) {
    const record = checked(await hub.from('rmc_institutions').select('project_ref').eq('id', id).single()); ref = record.project_ref || ref;
    if (ref) {
      const response = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers: { Authorization: `Bearer ${managementToken}` } });
      assert.ok(response.ok); const project = await response.json();
      assert.equal(project.name, `iars-${hubRef.slice(0,6)}-${id}`); assert.notEqual(ref, hubRef);
      const removal = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managementToken}` } }); assert.ok(removal.ok);
      console.log('Temporary cloud project removed.');
    }
    checked(await hub.from('rmc_institution_routes').delete().eq('slug', slug));
    checked(await hub.from('rmc_institutions').delete().eq('id', id));
  }
  if (logoPath) checked(await hub.storage.from('institution-logos').remove([logoPath]));
}
