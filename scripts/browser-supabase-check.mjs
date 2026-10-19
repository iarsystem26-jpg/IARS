import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const routes = {
  admin: [ '/ssg/panel', '/ssg/events', '/ssg/events/create', '/admin/attendance', '/admin/controls', '/admin/controls?tab=health', '/admin/controls?tab=payment', '/admin/controls?tab=rbac', '/ossa/dashboard', '/student/profile'],
  student: ['/dashboard', '/student/qr', '/student/calendar', '/student/events', '/student/ceremonies', '/student/records', '/student/profile'],
  mayor: ['/dashboard', '/mayor/scan', '/ssg/panel', '/student/profile'],
  ssg: ['/dashboard', '/ssg/panel', '/ssg/events', '/student/profile'],
  ossa: ['/ossa/dashboard', '/ssg/panel', '/admin/attendance', '/student/profile'],
};
const checks = [], errors = [];
try {
  for (const [role, paths] of Object.entries(routes)) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${role}: ${error.message}`));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#landing-login-identifier');
    const account = accounts.find(a => a.role === role);
    await page.type('#landing-login-identifier', account.username);
    await page.type('#landing-login-password', account.password);
    await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
    await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
    for (const route of paths) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
      try { await page.waitForSelector('main h1, main h2', { timeout: 20000 }); } catch(error) { console.log('BROWSER STATE '+JSON.stringify(await page.evaluate(() => ({hash:location.hash,text:document.body.innerText.slice(0,1500)})))); throw error; }
      assert.equal(await page.evaluate(() => location.hash), `#${route}`, `${role} route redirected: ${route}`);
      const alerts = await page.$$eval('[role="alert"]', nodes => nodes.map(n => n.textContent?.trim()).filter(Boolean));
      assert.equal(alerts.length, 0, `${route}: ${alerts.join('; ')}`);
      assert.equal(await page.evaluate(() => localStorage.getItem('rmc_regalia_db')), null);
      if (route === '/student/qr') await page.waitForSelector('[role="img"][aria-label^="Student QR code"] svg', { timeout: 15000 });
      for (const width of [375, 1280]) {
        await page.setViewport({ width, height: 900 });
        await new Promise(resolve => setTimeout(resolve, 350));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        if (overflow) console.log('OVERFLOW '+JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).display !== 'none').slice(0,12).map(e=>({tag:e.tagName,classes:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)})))));
        assert.equal(overflow, false, `${role} ${route} overflows at ${width}px`);
      }
      checks.push(`${role} ${route}`); console.log(`PASS browser ${role} ${route}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`Verified ${checks.length} authenticated browser routes at desktop and mobile widths.`);
} finally {
  fs.writeFileSync('.browser-verification.local', JSON.stringify({ timestamp: new Date().toISOString(), checks, errors }, null, 2));
  await browser.close();
}
