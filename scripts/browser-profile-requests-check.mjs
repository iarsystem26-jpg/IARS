import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
fs.mkdirSync('artifacts/profile-requests', { recursive: true });
try {
 for (const role of ['student', 'ossa', 'admin']) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const account = accounts.find(row => row.role === role);
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/${role === 'student' ? 'student/profile' : role === 'ossa' ? 'ossa/dashboard/requests' : 'ssg/panel'}`, { waitUntil: 'networkidle0' });
  const selector = `[aria-label="${role === 'student' ? 'My information requests' : 'Student information requests'}"]`;
  await page.waitForSelector(selector);
  await page.waitForFunction(selector => !document.querySelector(selector).textContent.includes('Loading requests'), {}, selector);
  assert.equal(await page.$eval(selector, el => !!el.querySelector('[role="alert"]')), false);
  for (const width of [1440, 375]) {
   await page.setViewport({ width, height: 900 });
   await page.screenshot({ path: `artifacts/profile-requests/${role}-${width}.png`, fullPage: true });
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${role} overflow at ${width}px`);
   if (role === 'student') {
    await page.evaluate(selector => [...document.querySelector(selector).querySelectorAll('button')].find(el => el.textContent.includes('Request information change')).click(), selector);
    await page.waitForSelector('[role="dialog"]');
    assert.ok(await page.$('#request-name'));
    assert.ok(await page.$('#request-reason'));
    assert.equal(await page.$eval('[role="dialog"]', el => el.scrollWidth > el.clientWidth + 2), false);
    await page.screenshot({ path: `artifacts/profile-requests/change-${width}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.evaluate(selector => [...document.querySelector(selector).querySelectorAll('button')].find(el => el.textContent.includes('Request information deletion')).click(), selector);
    await page.waitForSelector('[role="dialog"]');
    assert.ok(await page.$eval('[role="dialog"]', el => el.textContent.includes('Your account and school records will be retained')));
    await page.screenshot({ path: `artifacts/profile-requests/deletion-${width}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
   }
   console.log(`PASS ${role} information requests at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await context.close();
 }
} finally { await browser.close(); }
