import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
let ready = false;
for (let attempt = 0; attempt < 30 && !ready; attempt++) {
  try { ready = (await fetch(base, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
  if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(ready, 'The local app server did not become ready.');
const allowed = {
  admin: ['/dashboard', '/admin/hierarchy', '/ssg/events', '/admin/attendance', '/admin/controls', '/student/profile'],
  ossa: ['/ossa/dashboard', '/ossa/dashboard/activities', '/ssg/panel', '/ssg/events', '/admin/attendance', '/admin/controls?tab=health', '/student/profile'],
  ossa_staff: ['/ossa/dashboard', '/ossa/dashboard/excuses', '/ssg/panel', '/mayor/scan', '/admin/attendance', '/student/profile'],
  ssg: ['/dashboard', '/student/qr', '/student/records', '/ssg/panel', '/ssg/events', '/admin/attendance', '/mayor/scan'],
  mayor: ['/dashboard', '/student/qr', '/student/records', '/ssg/panel', '/mayor/scan', '/student/profile'],
  student: ['/dashboard', '/student/qr', '/student/calendar', '/student/events', '/student/ceremonies', '/student/records', '/student/profile', '/organizations'],
};
const denied = {
  student: ['/mayor/scan', '/ssg/panel', '/ssg/events', '/admin/controls', '/admin/attendance', '/ossa/dashboard'],
  mayor: ['/ssg/events', '/admin/controls', '/admin/attendance', '/ossa/dashboard'],
  ssg: ['/ossa/dashboard/activities'],
  admin: ['/ossa/dashboard/activities'],
};
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const checks = [], errors = [];
let currentPage;
try {
  for (const account of accounts) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    currentPage = page;
    page.on('pageerror', error => errors.push(`${account.role}: ${error.message}`));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#landing-login-identifier');
    await page.type('#landing-login-identifier', account.username);
    await page.type('#landing-login-password', account.password);
    await page.$eval('#landing-login-password', element => element.closest('form').requestSubmit());
    await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 60000 });
    for (const route of allowed[account.role] || []) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('main', { timeout: 30000 });
      await page.waitForFunction(() => !document.body.innerText.includes('Loading your workspace'), { timeout: 30000 });
      assert.equal(await page.evaluate(() => location.hash), `#${route}`, `${account.role}: ${route} redirected`);
      const alerts = await page.$$eval('[role="alert"]', elements => elements.map(element => element.textContent?.trim()).filter(Boolean));
      assert.deepEqual(alerts, [], `${account.role}: ${route} shows an error`);
      checks.push(`${account.role} allowed ${route}`);
      console.log(`PASS ${checks.at(-1)}`);
    }
    for (const route of denied[account.role] || []) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(expected => location.hash !== `#${expected}` && document.querySelector('main'), { timeout: 30000 }, route);
      checks.push(`${account.role} denied ${route}`);
      console.log(`PASS ${checks.at(-1)}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    const state = await currentPage.evaluate(() => ({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 2500) })).catch(() => null);
    console.error(JSON.stringify(state));
  }
  errors.push(error.message);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync('.role-audit-browser.local.json', JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
