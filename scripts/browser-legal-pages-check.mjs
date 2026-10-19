import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
fs.mkdirSync('artifacts/legal-pages', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#/privacy-policy`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Edit page'))), false);
  assert.equal(await page.$('main [role="alert"]'), null);
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  assert.ok(account, 'Admin test account required');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/admin/controls?tab=legal&page=privacy`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Edit page') && !button.disabled));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('a')].some(link => link.textContent.includes('Back to home'))), false);
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 900 });
    await page.screenshot({ path: `artifacts/legal-pages/preview-${width}.png`, fullPage: true });
    assert.equal(await page.$('input'), null, 'Preview must not contain editor fields');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Edit page')).click());
    await page.waitForSelector('form input');
    assert.equal(new URL(await page.url()).hash, '#/admin/controls?tab=legal&page=privacy');
    await page.screenshot({ path: `artifacts/legal-pages/editor-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Editor overflow at ${width}px`);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Cancel').click());
    await page.waitForFunction(() => !document.querySelector('form input'));
    console.log(`PASS legal preview, edit and cancel at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
