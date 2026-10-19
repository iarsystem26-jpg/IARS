import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
fs.mkdirSync('artifacts/class-student', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  let snapshot;
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/rest/v1/rpc/rmc_snapshot') && response.ok()) {
      const next = await response.json().catch(() => null);
      if (Array.isArray(next?.profiles)) snapshot = next;
    }
  });
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  for (let attempt = 0; !snapshot && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(snapshot, 'Authorized snapshot loaded');
  const student = snapshot.profiles.find(profile => profile.account_status === 'active' && ['student', 'mayor', 'ssg'].includes(profile.role) && profile.school_data?.academic_assignment?.terminalGroupId);
  assert.ok(student, 'A student assigned to a class is available');
  const unit = student.school_data.academic_assignment.terminalGroupId;
  for (const [theme, width] of [['light', 1440], ['light', 375], ['dark', 1440], ['dark', 375]]) {
    await page.evaluate(mode => localStorage.setItem('iars-theme', mode), theme);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(mode => document.documentElement.classList.contains('dark') === (mode === 'dark'), {}, theme);
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${base}/#/ssg/panel?unit=${encodeURIComponent(unit)}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('a[aria-label^="View student profile:"]');
    const links = await page.$$('a[aria-label^="View student profile:"]');
    const link = (await Promise.all(links.map(async entry => await entry.isVisible() ? entry : null))).find(Boolean);
    assert.ok(await link.$('img'), 'Student avatar appears in class list');
    const targetUrl = await link.evaluate(node => node.href);
    await link.click();
    await page.waitForSelector('nav[aria-label="Student detail sections"]');
    await page.waitForSelector('img[alt$=" profile"]');
    const targetUid = new URL(targetUrl).hash.split('/students/')[1].split('?')[0];
    const target = snapshot.profiles.find(profile => profile.uid === decodeURIComponent(targetUid));
    assert.equal(await page.$eval('main h1', node => node.textContent), target.name);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Overview overflow at ${width}`);
    await page.screenshot({ path: `artifacts/class-student/overview-${theme}-${width}.png`, fullPage: true });
    for (const [label, section] of [['Profile information', 'profile'], ['Requests', 'requests'], ['Attendance & sanctions', 'records']]) {
      await page.$$eval('nav[aria-label="Student detail sections"] button', (buttons, text) => buttons.find(button => button.textContent === text).click(), label);
      if (section === 'requests') {
        await page.waitForSelector('section[aria-label="Student requests"]');
        await page.waitForFunction(() => !document.querySelector('section[aria-label="Student information requests"] [role="status"]'));
        assert.equal(await page.$eval('section[aria-label="Student information requests"]', node => !!node.querySelector('[role="alert"]')), false, 'Student information request query succeeds');
      } else if (section === 'records') await page.waitForSelector('nav[aria-label="Attendance pagination"]');
      else await page.waitForSelector('section[aria-label="Parent / guardian"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${section} overflow at ${width}`);
      await page.screenshot({ path: `artifacts/class-student/${section}-${theme}-${width}.png`, fullPage: true });
    }
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('nav[aria-label="Student detail sections"]');
    assert.equal(await page.$eval('main h1', node => node.textContent), target.name, 'Student subpage survives refresh');
    assert.ok(page.url().includes('view=records'), 'Selected section survives refresh');
    await page.click('a[href^="#/ssg/panel?"]');
    await page.waitForSelector('nav[aria-label="Personnel registry pagination"]');
    assert.ok(page.url().includes(`unit=${encodeURIComponent(unit)}`), 'Returns to the same class');
    console.log(`PASS class avatars, student details, requests, records, refresh and return in ${theme} mode at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
