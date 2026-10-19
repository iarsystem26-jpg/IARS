import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Synthetic rows exist only in this browser's snapshot response; no database writes.
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
fs.mkdirSync('artifacts/approval-queues', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (request.method() !== 'POST' || !request.url().includes('/rest/v1/rpc/rmc_snapshot')) return request.continue();
    try {
      const response = await fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() });
      if (!response.ok) return request.respond({ status: response.status, contentType: 'application/json', body: await response.text() });
      const data = await response.json();
      const token = request.headers().authorization?.split(' ')[1];
      const viewerId = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;
      const officer = data.profiles.find(profile => profile.uid === viewerId && profile.role === 'ossa');
      assert.ok(officer, 'OSSA profile must be present');
      const scope = officer.official_data?.assignment_node_id || officer.school_data?.academic_assignment?.terminalGroupId;
      assert.ok(scope, 'OSSA test account needs an assigned school unit');
      const studentId = '00000000-0000-4000-8000-000000000001';
      const organizationId = '00000000-0000-4000-8000-000000000002';
      data.profiles.push({ ...officer, uid: studentId, name: 'Sample Student', role: 'student', account_status: 'active', student_id: 'SAMPLE-001', official_data: {}, school_data: { department: 'College', section: 'A', academic_assignment: { terminalGroupId: scope } } });
      data.organizations = [{ id: organizationId, name: 'Student Society', description: 'Sample organization', logo_url: '', node_id: scope, visible: true, joining: 'closed', key_required: false, head_ids: [], created_at: new Date().toISOString(), can_review: true, can_manage: true }];
      data.events = Array.from({ length: 12 }, (_, index) => ({ id: `sample-event-${index}`, title: index === 0 ? 'Campus Leadership Assembly' : `Student activity ${index + 1}`, description: 'A student-led activity supporting collaboration and leadership.', kind: 'attendance', requiresOssaApproval: true, approvalStatus: 'pending', created_by: studentId, status: 'upcoming', scopeNodeId: scope, organizationId: index === 0 ? organizationId : undefined, startTime: Date.now() + 86400000, endTime: Date.now() + 90000000, participantsType: 'all', recipientGroups: ['All Students'], audienceTarget: { mode: 'all' }, penaltyValue: 2, penaltyUnit: 'hours', geofenceEnabled: false, location: { lat: 0, lng: 0, radius_meters: 100 } }));
      data.organization_sanctions = [{ id: 'sample-sanction', organization_id: organizationId, student_id: studentId, student_name: 'Sample Student', hours: 2, reason: 'Unexcused absence from an organization activity.', status: 'pending', created_at: new Date().toISOString() }];
      data.excuses = Array.from({ length: 12 }, (_, index) => ({ id: `sample-excuse-${index}`, student_uid: studentId, student_name: 'Sample Student', student_id: 'SAMPLE-001', department: 'College', section: 'A', event_title: index === 0 ? 'Campus Leadership Assembly' : `Assembly ${index + 1}`, category: 'medical', reason: 'A scheduled medical appointment prevented attendance. Please review this absence and the requested waiver.', submission_date: Date.now() - index * 1000, status: 'pending' }));
      await request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
    } catch (error) { errors.push(error.message); await request.abort(); }
  });
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'ossa');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 1000 });
    for (const section of ['activities', 'organizations', 'excuses']) {
      await page.goto(`${base}/#/ossa/dashboard/${section}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('main table tbody button').catch(() => { throw new Error(`${section}: table rows did not load; ${errors.join('; ')}`); });
      assert.equal(await page.$('main select'), null, 'Use custom dropdowns');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${section} overflow at ${width}`);
      assert.equal(await page.$$eval('main table th', elements => elements.length), 1);
      if (section !== 'organizations') {
        assert.equal(await page.$$eval('main table tbody button', elements => elements.length), 10);
        await page.$eval('button[aria-label="Next page"]', button => button.click());
        await page.waitForFunction(() => document.querySelectorAll('main table tbody button').length === 2);
        await page.$eval('button[aria-label="Previous page"]', button => button.click());
        await page.waitForFunction(() => document.querySelectorAll('main table tbody button').length === 10);
      }
      await page.screenshot({ path: `artifacts/approval-queues/${section}-${width}.png`, fullPage: true });
      await page.$eval('main table tbody button', button => button.click());
      await page.waitForSelector('[role="dialog"]');
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[role="dialog"]')).opacity) === 1);
      assert.ok(await page.$('[role="dialog"] textarea'), 'Pending request has decision notes');
      assert.equal(await page.$eval('[role="dialog"]', dialog => dialog.scrollWidth > dialog.clientWidth + 2), false);
      await page.screenshot({ path: `artifacts/approval-queues/${section}-details-${width}.png`, fullPage: true });
      await page.$eval('[aria-label="Close dialog"]', button => button.click());
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      console.log(`PASS ${section} brief table, custom dropdowns, pagination and modal at ${width}px`);
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
