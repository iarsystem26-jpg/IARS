// Browser smoke checks against the configured project and local frontend.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4175';
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
const correctionApiErrors = [];
try {
 for (const role of ['student', 'admin']) {
  const context = await browser.createBrowserContext(), page = await context.newPage();
  page.on('response', async response => {
   if (response.status() >= 400 && response.url().includes('/rest/v1/')) {
    const data = await response.json().catch(() => ({}));
    console.log('API ERROR', new URL(response.url()).pathname, response.status(), data.message || data.code || '');
    if (/rmc_attendance_corrections|rmc_correction_options|rmc_(submit|review)_attendance_correction/.test(new URL(response.url()).pathname)) correctionApiErrors.push(data.message || data.code || response.status());
   }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  const account = accounts.find(item => item.role === role);
  assert.ok(account, `Prepare the ${role} demo account first.`);
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  if (role === 'admin') {
   await page.goto(`${base}/#/ossa/dashboard`, { waitUntil: 'networkidle0' });
   await page.waitForSelector('nav[aria-label="OSSA workspaces"] a[href="#/ossa/dashboard/corrections"]');
   assert.ok(await page.$('nav[aria-label="OSSA workspaces"] a[href="#/ossa/dashboard/corrections"]'));
   console.log('PASS browser Attendance corrections card is visible in the OSSA Hub');
  }
  const route = role === 'student' ? '/student/records' : '/ossa/dashboard/corrections';
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table[aria-label="My correction requests requests"], table[aria-label="Attendance correction queue requests"]', { timeout: 30000 });
  assert.equal(await page.evaluate(() => location.hash), `#${route}`);
  const panel = role === 'student' ? 'Attendance corrections' : 'Attendance corrections review';
  assert.deepEqual(await page.$$eval(`[aria-label="${panel}"] [role="alert"]`, nodes => nodes.map(node => node.textContent.trim()).filter(Boolean)), []);
  if (role === 'student') {
   await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Report a problem / missing record')).click());
   await page.waitForSelector('[role="dialog"]');
   if (await page.$('[aria-label="Activity and session"]')) {
    assert.ok(await page.$('[role="combobox"][aria-label="Activity and session"]'));
   } else {
    assert.ok(await page.evaluate(() => document.querySelector('[role="dialog"]').textContent.includes('No sessions available for correction')));
    assert.equal(await page.$('[aria-label="Explain the recording mistake"]'), null);
   }
  }
  for (const width of [375, 1280]) {
   await page.setViewport({ width, height: 900 });
   await new Promise(resolve => setTimeout(resolve, 250));
   await page.screenshot({ path: `.attendance-corrections-${role}-${width}.local.png`, fullPage: true });
   const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
   if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] *')].filter(el => el.getBoundingClientRect().right > innerWidth + 2).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }))));
   assert.equal(overflow, false, `${role}: overflow at ${width}px`);
  }
  console.log(`PASS browser ${role} correction ${role === 'student' ? 'history and request dialog' : 'review route'} at mobile/desktop widths`);
  if (role === 'student') {
   // A read-only response fixture exercises the populated form without creating
   // demo events or submitting changes to the school's database.
   await page.setRequestInterception(true);
   page.on('request', request => {
    if (new URL(request.url()).pathname === '/rest/v1/rpc/rmc_correction_options' && request.method() === 'POST') {
     void request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify([{
      event_id: 'preview-event', event_title: 'Demo assembly', slot: 'default', label: 'Morning session',
      starts_at: '2026-10-08T00:00:00Z', ends_at: '2026-10-08T02:00:00Z', late_at: '2026-10-08T00:15:00Z', original: { status: 'absent', scanned_by_name: 'System' },
     }]) });
    } else void request.continue();
   });
   await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
   await page.waitForSelector('table[aria-label="My correction requests requests"]');
   await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Report a problem / missing record')).click());
   await page.waitForSelector('[role="combobox"][aria-label="Activity and session"]');
   await page.click('[aria-label="Activity and session"]');
   await page.waitForSelector('[role="option"]');
   await page.click('[role="option"]');
   await page.waitForSelector('[aria-label="Requested time-in hour"]');
   await page.select('[aria-label="Requested time-in hour"]', '8');
   await page.select('[aria-label="Requested time-in minute"]', '05');
   await page.waitForFunction(() => document.querySelector('[aria-label="Requested change"]')?.textContent.includes('present'));
   assert.ok(await page.$('[aria-label="Supporting evidence"].sr-only'));
   for (const width of [375, 1280]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Populated request overflows at ${width}px`);
    await page.screenshot({ path: `.attendance-corrections-preview-${width}.local.png`, fullPage: false });
   }
   console.log('PASS browser custom session/time controls, file selector and absent-to-present preview (read-only fixture)');
  }
  if (role === 'admin') {
   // Read-only fixtures exercise the credit review without saving a decision.
   const fixture = {
    id: 'credit-preview-request', student_id: 'fixture-student', student_name: 'Credit Demo Student', student_number: '123',
    event_id: 'credit-event', event_title: 'Service correction demo', kind: 'service', slot: 'default',
    reason: 'The officer confirmed that checkout was one hour earlier.', proof_url: null,
    original: { status: 'present', time_in: Date.parse('2026-10-08T00:00:00Z'), time_out: Date.parse('2026-10-08T02:00:00Z'), rendered_hours: 2 },
    corrected: null, proposed_time_in: '2026-10-08T00:00:00Z', proposed_time_out: '2026-10-08T01:00:00Z',
    session_starts_at: '2026-10-08T00:00:00Z', session_ends_at: '2026-10-08T02:00:00Z', session_late_at: '2026-10-08T00:15:00Z',
    status: 'pending', created_at: '2026-10-09T00:00:00Z', reviewed_at: null, reviewer_name: null, review_note: '', sanction_change: 0,
   };
   const plan = { kind: 'service', rendered_before: 2, rendered_after: 1, cleared_before: 1, cleared_after: 1,
    merit_before: 1, merit_after: 0, sanction_change: 0, merit_change: -1, balance_before: 3, balance_after: 3, complete: true };
   await page.setRequestInterception(true);
   page.on('request', request => {
    const path = new URL(request.url()).pathname;
    const body = path === '/rest/v1/rmc_attendance_corrections' && request.method() === 'GET' ? [fixture]
     : path === '/rest/v1/rpc/rmc_preview_correction_credit' && request.method() === 'POST' ? plan : null;
    if (body) void request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
    else void request.continue();
   });
   await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
   await page.reload({ waitUntil: 'networkidle0' });
   await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Service correction demo / default')));
   await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Service correction demo / default')).click());
   await page.waitForSelector('[aria-label="Credit change preview"]');
   await page.type('[aria-label="Decision notes"]', 'Officer verified the service checkout.');
   assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Approve correction') && !button.disabled)));
   for (const width of [375, 1280]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Credit review overflows at ${width}px`);
    await page.$eval('[aria-label="Credit change preview"]', element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `.attendance-credit-review-${width}.local.png`, fullPage: false });
   }
   console.log('PASS browser service credit preview and approval availability at mobile/desktop widths (read-only fixture)');
  }
  await context.close();
 }
 assert.deepEqual(errors, []);
 assert.deepEqual(correctionApiErrors, []);
} finally { await browser.close(); }
