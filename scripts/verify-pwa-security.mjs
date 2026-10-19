import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4175';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
try {
  const context = browser.defaultBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
  });
  const response = await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  const headers = response.headers();
  assert.ok(headers['content-security-policy'].includes("script-src 'self'"));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['cache-control'], /no-cache/);
  assert.match((await fetch(`${base}/sw.js`)).headers.get('cache-control') || '', /no-store/);
  assert.ok(headers['permissions-policy'].includes('camera=(self), geolocation=(self)'));
  pass('production security headers protect scripts, framing, camera, and GPS');

  await page.waitForSelector('#landing-login-identifier');
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), { timeout: 180000 });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  const cdp = await page.createCDPSession();
  const appManifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors, []);
  const manifest = JSON.parse(appManifest.data);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const dimensions = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode(); return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    assert.equal(dimensions, icon.sizes);
  }
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  pass('manifest, installability, standard/maskable icons, and controlling service worker');

  assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(item => item.role === 'student');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash === '#/dashboard', { timeout: 45000 });
  assert.equal(await page.evaluate(() => location.hash), '#/dashboard');
  pass('real Supabase login and dashboard work under the production CSP');

  const cachedUrls = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    return urls;
  });
  assert.ok(cachedUrls.length > 10);
  for (const url of cachedUrls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, new URL(base).origin, `Foreign cache entry: ${parsed.origin}`);
    assert.ok(/^\/(?:assets\/|icons\/|fonts\/[^/]+\.woff2$|index\.html$|manifest\.webmanifest$|academic-seal(?:\.jpeg|-transparent\.png)$|avatar-placeholder\.svg$)/.test(parsed.pathname), `Unexpected cached path: ${parsed.pathname}`);
    assert.ok(!/access_token|refresh_token|password|code=/.test(parsed.search));
  }
  pass('cache contains only app assets after real authentication; no API responses or credentials');

  // A recovery URL must never be stored in Cache Storage.
  await page.goto(`${base}/?code=pwa-verification-value#/login`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(async () => {
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (request.url.includes('pwa-verification-value')) return true;
    return false;
  }), false);
  pass('authentication callback query parameters are never persisted in the service worker cache');

  await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.injectedScriptExecuted = true'; document.body.appendChild(script); });
  assert.equal(await page.evaluate(() => window.injectedScriptExecuted), undefined);
  pass('CSP blocks injected inline JavaScript');

  await page.setOfflineMode(true);
  await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="App status"]', { timeout: 20000 });
  assert.match(await page.$eval('[aria-label="App status"]', element => element.textContent), /offline/i);
  await page.setViewport({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  pass('offline cold navigation loads the app and explains online-only operations on mobile');
  await page.goto(`${base}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.textContent.includes('Your workspace is unavailable'), { timeout: 15000 });
  assert.equal(await page.evaluate(() => location.hash), '#/dashboard');
  pass('offline sessions retain their route and request a connection instead of appearing as unapproved applicants');
  await page.setOfflineMode(false);
  await cdp.send('Network.overrideNetworkState', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.waitForFunction(() => !document.querySelector('[aria-label="App status"]')?.textContent?.includes('offline'), { timeout: 15000 });
  assert.deepEqual(errors, []);
  pass('reconnection clears offline status without JavaScript crashes');
  await page.close();
} finally {
  fs.writeFileSync('.pwa-security-verification.local', JSON.stringify({ timestamp: new Date().toISOString(), checks }, null, 2));
  await browser.close();
}
