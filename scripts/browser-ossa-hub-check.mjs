import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
fs.mkdirSync('artifacts/ossa-hub', { recursive: true });
try {
 const page = await browser.newPage(); const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'ossa');
 await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
 await page.waitForSelector('#landing-login-identifier');
 await page.type('#landing-login-identifier', account.username);
 await page.type('#landing-login-password', account.password);
 await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
 await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
 const sections = { activities: 'Event & ceremony approvals', requests: 'Student information requests', sanctions: 'Student sanctions', excuses: 'Excuse applications', analytics: 'Sanction analytics', organizations: 'Organization approvals' };
 for (const width of [1440, 375]) {
  await page.setViewport({ width, height: 1000 });
  await page.goto(`${base}/#/ossa/dashboard`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('nav[aria-label="OSSA workspaces"]');
  assert.equal(await page.$$eval('nav[aria-label="OSSA workspaces"] a', links => links.length), 6);
  assert.equal(await page.$('[aria-label="Student information requests"]'), null);
  assert.equal(await page.$('[aria-label="OSSA activity approvals"]'), null);
  assert.equal(await page.$('[aria-label="Sanction status chart"]'), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await page.screenshot({ path: `artifacts/ossa-hub/overview-${width}.png`, fullPage: true });
  for (const [section, title] of Object.entries(sections)) {
   await page.goto(`${base}/#/ossa/dashboard/${section}`, { waitUntil: 'networkidle0' });
   await page.waitForFunction(title => document.querySelector('main h1')?.textContent === title, {}, title);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${section} overflow at ${width}`);
   assert.equal(await page.$$eval('nav[aria-label="OSSA Hub pages"] a', links => links.length), 1);
   assert.ok(await page.$('nav[aria-label="OSSA Hub pages"] a[href="#/ossa/dashboard"]'));
   assert.ok(await page.$('button[aria-current="page"][aria-label="OSSA Hub"], button[aria-current="page"]'));
   if (section === 'requests') {
    await page.waitForFunction(() => !document.querySelector('[aria-label="Student information requests"]').textContent.includes('Loading requests'));
    assert.equal(await page.$eval('[aria-label="Student information requests"]', el => !!el.querySelector('[role="alert"]')), false);
   }
   await page.screenshot({ path: `artifacts/ossa-hub/${section}-${width}.png`, fullPage: true });
   await page.reload({ waitUntil: 'networkidle0' });
   await page.waitForFunction(title => document.querySelector('main h1')?.textContent === title, {}, title);
   assert.equal(await page.$('#ossa-workspace'), null);
   console.log(`PASS ${section} direct route, reload and navigation at ${width}px`);
  }
 }
 assert.deepEqual(errors, []);
} finally { await browser.close(); }
