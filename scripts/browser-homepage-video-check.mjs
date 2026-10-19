import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
fs.mkdirSync('artifacts/homepage-video', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#explainer video');
  assert.ok(await page.$eval('#explainer video', video => video.src.includes('iars-explainer')));
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  assert.ok(account);
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/admin/controls?tab=video`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#homepage-video');
  const original = await page.$eval('#homepage-video', input => input.value);
  const options = await page.$$eval('#homepage-video option', rows => rows.map(row => row.value));
  assert.equal(options.length, 7);
  const advertisement = options.find(value => value.includes('IARS-Advertisement'));
  assert.ok(advertisement);
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 900 });
    await page.select('#homepage-video', advertisement);
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
    assert.ok(await page.$eval('video', video => video.src.includes('IARS-Advertisement')));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: `artifacts/homepage-video/preview-${width}.png`, fullPage: true });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Cancel changes').click());
    assert.equal(await page.$eval('#homepage-video', input => input.value), original);
  }
  // Save the existing value to exercise persistence without changing the public selection.
  await page.select('#homepage-video', advertisement);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  await page.select('#homepage-video', original);
  await page.$eval('#homepage-video', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => document.body.textContent.includes('Homepage video saved.'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#homepage-video');
  assert.equal(await page.$eval('#homepage-video', input => input.value), original);
  assert.deepEqual(errors, []);
  console.log('PASS homepage video preview, cancel, save, persistence, and responsive layout');
} finally { await browser.close(); }
