import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'student');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/student/records`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('nav[aria-label="Attendance pagination"]');
  fs.mkdirSync('artifacts', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 1000 });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Records overflow at ${width}px`);
    await page.screenshot({ path: `artifacts/student-records-${width}.png`, fullPage: true });
    const button = width === 375 ? '.mobile-data-card article[role="button"]' : '.desktop-data-table tbody button';
    if (await page.$(button)) {
      await page.click(button);
      await page.waitForSelector('[role="dialog"]');
      assert.ok(await page.$eval('[role="dialog"]', node => node.textContent.includes('Verified by')));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.screenshot({ path: `artifacts/student-record-details-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
    }
    console.log(`PASS records and details at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
