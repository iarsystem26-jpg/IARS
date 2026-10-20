import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(item => item.role === 'admin');
assert.ok(account, 'A configured administrator verification account is required.');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
// Writing screenshots inside Vite's watched workspace can reload the page
// during a test. Copy them back only after closing the browser.
const captures = fs.mkdtempSync(path.join(os.tmpdir(), 'iars-drive-ui-'));
let page;
try {
  page = await browser.newPage();
  await page.bringToFront();
  await page.setViewport({ width: 1440, height: 1050 });
  const errors = [], reads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('script.google.com/macros/') && request.method() === 'POST') {
      try { const body = JSON.parse(request.postData()); if (body.action === 'folder_setup') reads.push(body); } catch {}
    }
  });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', element => element.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  reads.length = 0;
  await page.goto(`${base}/#/admin/controls?tab=drive`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[aria-label="Open Profile Photos"]:not([disabled])', { timeout: 60000 });
  assert.equal(reads.length, 1, 'Initial folder setup should issue only one request, including in StrictMode.');
  assert.equal(await page.evaluate(() => document.body.textContent.includes('Manage Drive folders')), false);
  fs.mkdirSync('artifacts', { recursive: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  const clickText = async text => {
    const button = await page.waitForFunction(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled), {}, text);
    await button.asElement().evaluate(element => element.click());
  };
  await clickText('New folder');
  await page.waitForSelector('[role="dialog"] input', { timeout: 5000 }).catch(error => { console.log({ browserErrors: errors }); throw error; });
  assert.ok(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)), 'Focus should stay inside the dialog.');
  await clickText('Cancel');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Search folders"]')?.closest('[inert]'));
  await page.$eval('input[aria-label="Search folders"]', input => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no-folder-with-this-name');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.$eval('input[aria-label="Search folders"]', input => input.value), 'no-folder-with-this-name');
  await page.waitForFunction(() => document.body.textContent.includes('No matching folders'));
  await clickText('Clear search');
  await page.screenshot({ path: path.join(captures, 'drive-folders-desktop.png'), fullPage: true });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  // Switching mobile emulation reloads the document; wait for Auth and Drive.
  await page.waitForSelector('button[aria-label="Open Profile Photos"]:not([disabled])', { timeout: 60000 });
  await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(mobile.content <= 390 && mobile.content <= mobile.viewport, `Mobile layout must not scroll horizontally: ${JSON.stringify(mobile)}`);
  await page.screenshot({ path: path.join(captures, 'drive-folders-mobile.png'), fullPage: true });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.waitForSelector('button[aria-label="Open Profile Photos"]:not([disabled])', { timeout: 60000 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(captures, 'drive-folders-dark.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS live folder browser: one initial request, folder cards, search, dialog focus, mobile layout and dark mode; no files changed.');
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(captures, 'drive-folders-check-failure.png'), fullPage: true });
    console.log(await page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, search: document.querySelector('input[aria-label="Search folders"]')?.value, active: document.activeElement?.tagName, alerts: [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent) })));
  }
  throw error;
} finally {
  await browser.close();
  fs.mkdirSync('artifacts', { recursive: true });
  for (const name of fs.readdirSync(captures)) {
    fs.copyFileSync(path.join(captures, name), path.join('artifacts', name));
    fs.unlinkSync(path.join(captures, name));
  }
  fs.rmdirSync(captures);
}
