import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4178';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
let revision = 'browser-revision-one';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('/rest/v1/rmc_app_release?')) {
      void request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: JSON.stringify([{ revision }]) });
    } else void request.continue();
  });
  const response = await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  assert.match(response.headers()['cache-control'], /no-cache/);
  assert.match((await fetch(`${base}/version.json`)).headers.get('cache-control'), /no-store/);
  await page.waitForSelector('#landing-login-identifier');
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), { timeout: 60000 });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  await page.evaluate(async () => {
    localStorage.setItem('test-preserved-session', 'kept');
    await caches.open('attendance-queue-verification');
  });
  let networkNavigation = false;
  page.on('response', response => {
    if (response.request().isNavigationRequest() && response.url().includes('_app_refresh=')) networkNavigation = !response.fromServiceWorker();
  });
  revision = 'browser-revision-two';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => location.search.includes('_app_refresh='), { timeout: 30000 });
  await page.waitForSelector('#landing-login-identifier');
  assert.equal(networkNavigation, true, 'Refresh navigation must bypass the old service worker');
  assert.equal(await page.evaluate(() => location.hash), '#/login');
  assert.equal(await page.evaluate(() => localStorage.getItem('test-preserved-session')), 'kept');
  assert.equal(await page.evaluate(() => localStorage.getItem('rmc-app-refresh-revision')), revision);
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('attendance-queue-verification')), true);
  const refreshedUrl = page.url();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(page.url(), refreshedUrl, 'Current clients must not reload repeatedly');
  assert.deepEqual(errors, []);
  console.log('PASS logged-out refresh bypasses old worker, preserves route/storage/attendance cache, and does not loop');
  console.log('PASS deployment version endpoint uses no-store headers');
} finally { await browser.close(); }
