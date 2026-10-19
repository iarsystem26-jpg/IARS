import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
try {
  for (const role of ['ssg', 'admin', 'ossa']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const account = accounts.find(item => item.role === role);
    await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#landing-login-identifier');
    await page.type('#landing-login-identifier', account.username);
    await page.type('#landing-login-password', account.password);
    await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
    await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
    if (role === 'ssg') {
      await page.goto(`${base}/#/ssg/panel`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Institution Control Hub'));
      assert.equal(await page.$('button[aria-label="Add unit"]'), null);
      await page.goto(`${base}/#/ssg/events/create`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[aria-label="OSSA approval requirement"]');
      await page.screenshot({ path: 'artifacts/ssg-approval-requirement.png', fullPage: true });
      console.log('PASS SSG cannot add units and sees mandatory OSSA approval');
    } else if (role === 'admin') {
      await page.goto(`${base}/#/admin/controls?tab=rbac`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('button[aria-label="Edit role SSG Officer"]');
      await page.click('button[aria-label="Edit role SSG Officer"]');
      await page.waitForSelector('input[aria-label="Require OSSA Approval"]');
      assert.equal(await page.$eval('input[aria-label="Require OSSA Approval"]', input => input.checked), true);
      assert.equal(await page.$eval('input[aria-label="Create Directory Units"]', input => input.checked), false);
      await page.$eval('input[aria-label="Require OSSA Approval"]', input => input.scrollIntoView());
      await page.screenshot({ path: 'artifacts/admin-ssg-rbac.png', fullPage: true });
      console.log('PASS ADMIN sees persisted SSG workflow defaults in RBAC');
    } else {
      await page.goto(`${base}/#/ossa/dashboard`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[aria-label="OSSA activity approvals"]');
      await page.$eval('[aria-label="OSSA activity approvals"]', node => node.scrollIntoView());
      await page.screenshot({ path: 'artifacts/ossa-activity-approvals.png', fullPage: true });
      console.log('PASS OSSA dashboard displays the approval queue');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
