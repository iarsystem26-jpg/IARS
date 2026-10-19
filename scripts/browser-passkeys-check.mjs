import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const origin = `https://${process.env.VITE_PASSKEY_RP_ID}`;
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false, experimental: { passkey: true } } };
const userClient = createClient(url, key, options);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(item => item.role === 'student');
assert.ok(account, 'A local student test account is required.');
assert.ok(fs.existsSync('dist/index.html'), 'Run npm run build first.');
const checks = [], errors = [];
const ownPasskeys = new Set();
let browser, page, userId, beforeIds;
const ok = name => { checks.push(name); console.log(`PASS ${name}`); };
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
async function button(page, text) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === label && !el.disabled), { timeout: 25000 }, text);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && !el.disabled).click(), text);
}
async function textVisible(page, text) {
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 30000 }, text);
}
async function passwordLogin(page) {
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash === '#/dashboard' && document.querySelector('main'), { timeout: 40000 });
}
try {
  const login = await userClient.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ifError(login.error); userId = login.data.user.id;
  const initial = await userClient.auth.passkey.list(); assert.ifError(initial.error);
  beforeIds = new Set(initial.data.map(item => item.id));
  const factors = await userClient.auth.mfa.listFactors(); assert.ifError(factors.error);
  assert.equal(factors.data.totp.filter(item => item.status === 'verified').length, 0, 'Use a student test account without existing MFA for this browser check.');

  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/auth/v1/passkeys/') && response.status() >= 400) {
      console.log('Passkey rejection: ' + JSON.stringify(await response.json().catch(() => ({ status: response.status() }))));
    }
  });
  await page.setRequestInterception(true);
  // Serve the local production build at the configured HTTPS origin inside this
  // isolated browser only. Nothing is uploaded or deployed to the website.
  page.on('request', request => {
    if (!request.url().startsWith(`${origin}/`)) { void request.continue(); return; }
    const pathname = decodeURIComponent(new URL(request.url()).pathname);
    const root = path.resolve('dist');
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      void request.respond({ status: 404, body: 'Not found' }); return;
    }
    void request.respond({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', headers: { 'Cache-Control': 'no-store' }, body: fs.readFileSync(file) });
  });
  let verificationBody;
  page.on('request', request => {
    if (request.url() === `${url}/auth/v1/passkeys/authentication/verify`) verificationBody = request.postData();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  await page.goto(`${origin}/#/login`, { waitUntil: 'networkidle0' });
  await passwordLogin(page); ok('existing username/password login');
  await page.goto(`${origin}/#/student/profile`, { waitUntil: 'networkidle0' });
  await textVisible(page, 'Passkeys');
  await button(page, 'Add passkey');
  await textVisible(page, 'Passkey added.');
  const registered = await userClient.auth.passkey.list(); assert.ifError(registered.error);
  for (const item of registered.data) if (!beforeIds.has(item.id)) ownPasskeys.add(item.id);
  fs.writeFileSync('.passkey-test-credential.local', JSON.stringify({ userId, ids: [...ownPasskeys] }));
  assert.equal(ownPasskeys.size, 1, 'Exactly one test credential should be enrolled.');
  const ownKey = registered.data.find(item => ownPasskeys.has(item.id));
  const testName = `Browser verification ${Date.now()}`;
  const renamed = await userClient.auth.passkey.update({ passkeyId: ownKey.id, friendlyName: testName }); assert.ifError(renamed.error);
  const credentials = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  assert.equal(credentials.credentials.length, 1);
  assert.equal(credentials.credentials[0].rpId, process.env.VITE_PASSKEY_RP_ID);
  ok('real Supabase challenge, virtual WebAuthn enrollment, and saved credential');
  for (const width of [375, 1280]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => {
      const settings = document.querySelector('[aria-label="Passkey settings"]');
      return settings.scrollWidth > settings.clientWidth + 2 || settings.getBoundingClientRect().right > innerWidth + 2;
    }), false, `Passkey settings overflow at ${width}px`);
  }
  ok('passkey settings fit mobile and desktop');
  await page.$eval('[aria-label="Sign out of portal"]', el => el.click());
  await page.waitForSelector('#landing-login-identifier');
  await button(page, 'Sign in with passkey');
  await page.waitForFunction(() => location.hash === '#/dashboard' && document.querySelector('main'), { timeout: 40000 });
  const signedInId = await page.evaluate(() => {
    const entry = Object.keys(localStorage).find(key => /^sb-.*-auth-token$/.test(key));
    return entry ? JSON.parse(localStorage.getItem(entry)).user.id : null;
  });
  assert.equal(signedInId, userId); ok('passkey login creates the correct account session and opens its dashboard');
  assert.ok(verificationBody, 'The browser must verify its assertion with Supabase.');
  const replay = await fetch(`${url}/auth/v1/passkeys/authentication/verify`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: verificationBody });
  assert.equal(replay.ok, false, 'A used assertion must not create another login.');
  const replayError = await replay.json(); assert.equal(replayError.error_code || replayError.code, 'webauthn_challenge_not_found');
  ok('Supabase rejects a replayed authentication challenge');
  await page.goto(`${origin}/#/student/profile`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Passkey settings"] button[aria-label^="Remove "]');
  // Use the API list's server-derived friendly name to select only our new key.
  const removeLabel = `Remove ${testName}`;
  await page.evaluate(label => {
    const settings = document.querySelector('[aria-label="Passkey settings"]');
    [...settings.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label).click();
  }, removeLabel);
  await button(page, 'Confirm removal'); await textVisible(page, 'Passkey removed.');
  const remaining = await service.auth.admin.passkey.listPasskeys({ userId }); assert.ifError(remaining.error);
  assert.equal(remaining.data.some(item => ownPasskeys.has(item.id)), false); ok('confirmed passkey revocation removes the server credential');
  await page.$eval('[aria-label="Sign out of portal"]', el => el.click()); await page.waitForSelector('#landing-login-identifier');
  await button(page, 'Sign in with passkey'); await textVisible(page, 'This passkey could not be verified.');
  assert.equal(await page.evaluate(() => location.hash), '#/login'); ok('revoked passkey cannot sign in');
  await passwordLogin(page); ok('password fallback still works after revocation');
  assert.deepEqual(errors, []); ok('no uncaught browser errors');
} catch (error) {
  if (page) console.log('Browser failure state: ' + JSON.stringify(await page.evaluate(() => ({ route: location.hash, alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent), text: document.body.innerText.slice(-1500) }))));
  throw error;
} finally {
  if (userId && beforeIds) {
    const result = await service.auth.admin.passkey.listPasskeys({ userId });
    if (result.error) throw new Error(`Passkey cleanup failed: ${result.error.message}`);
    for (const item of result.data || []) {
      if (ownPasskeys.has(item.id)) {
        const cleanup = await service.auth.admin.passkey.deletePasskey({ userId, passkeyId: item.id });
        if (cleanup.error) throw new Error(`Passkey cleanup failed: ${cleanup.error.message}`);
      }
    }
  }
  await userClient.auth.signOut({ scope: 'local' });
  if (browser) await browser.close();
  fs.writeFileSync('.passkey-browser-verification.local', JSON.stringify({ timestamp: new Date().toISOString(), origin, checks, errors }, null, 2));
}
console.log(`Verified ${checks.length} passkey browser checks; test credentials removed.`);
