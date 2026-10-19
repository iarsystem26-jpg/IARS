import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4176';
const artifacts = path.resolve('artifacts/clearance'); fs.mkdirSync(artifacts, { recursive: true });
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const certificate = { id: 'sample', reference: 'CLR-DEMO0000000000000000000000000000', token: 'a'.repeat(64), issued_at: '2026-10-09T08:00:00Z', cleared_at: '2026-10-09T07:00:00Z',
 details: { student_name: 'Juan Dela Cruz (Demo)', student_number: '2026-00001', school_name: 'Senior High School', period_title: 'Demonstration clearing period', starts_at: '2026-10-08T00:00:00Z', ends_at: '2026-10-10T09:00:00Z', authorized_by: 'OSSA Administrator' } };
let rows = [{ id: 'sample-period', title: certificate.details.period_title, starts_at: certificate.details.starts_at, ends_at: certificate.details.ends_at, release_enabled: false, eligible: true, eligible_count: 1, issued_count: 0 }];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
async function login(page, role) {
 const account = accounts.find(a => a.role === role);
 await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
 await page.waitForSelector('#landing-login-identifier');
 await page.type('#landing-login-identifier', account.username); await page.type('#landing-login-password', account.password);
 await page.$eval('#landing-login-password', el => el.closest('form').requestSubmit());
 await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 45000 });
}
async function fixture(page) {
 page.on('pageerror', error => errors.push(error.message));
 await page.setRequestInterception(true);
 page.on('request', request => {
  if (request.method() === 'OPTIONS') { request.continue(); return; }
  if (request.url().endsWith('/rpc/rmc_clearance')) {
   const body = JSON.parse(request.postData() || '{}');
   if (body.operation === 'release') rows = rows.map(row => ({ ...row, release_enabled: body.payload.enabled }));
   request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body.operation === 'issue' ? certificate : rows) });
  } else request.continue();
 });
}
async function clickText(page, text) {
 await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.includes(text)), {}, text);
 await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text)).click(), text);
}
try {
 const officerContext = await browser.createBrowserContext(), officer = await officerContext.newPage();
 await fixture(officer); await login(officer, 'ossa');
 await officer.goto(`${base}/#/ossa/dashboard/clearance`, { waitUntil: 'networkidle0' });
 await officer.waitForSelector('section[aria-label="Clearance certificates"]');
 await officer.waitForFunction(() => document.body.textContent.includes('1 eligible'));
 for (const width of [1440, 375]) {
  await officer.setViewport({ width, height: 1000 });
  await new Promise(resolve => setTimeout(resolve, 350));
  await officer.screenshot({ path: path.join(artifacts, `ossa-${width}.png`), fullPage: true });
  assert.equal(await officer.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
 }
 await clickText(officer, 'Enable release');
 assert.equal(rows[0].release_enabled, false);
 await clickText(officer, 'Confirm release');
 await officer.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Hold release')));
 assert.equal(rows[0].release_enabled, true);

 const studentContext = await browser.createBrowserContext(), student = await studentContext.newPage();
 await fixture(student); await login(student, 'student');
 await student.goto(`${base}/#/student/records`, { waitUntil: 'networkidle0' });
 // Dismiss an existing celebration if the demonstration account already has clearance history.
 if (await student.$('[role="dialog"]')) await student.keyboard.press('Escape');
 for (const width of [1440, 375]) {
  await student.setViewport({ width, height: 1000 });
  assert.equal(await student.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await student.screenshot({ path: path.join(artifacts, `student-${width}.png`), fullPage: true });
 }
 await student.setViewport({ width: 1440, height: 1000 });
 await clickText(student, 'Request certificate');
 await student.waitForSelector('iframe[title="A4 landscape clearance certificate preview"]', { timeout: 45000 });
 const client = await student.createCDPSession();
 await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts });
 const downloadedSince = Date.now();
 await clickText(student, 'Download A4 landscape PDF');
 const pdf = path.join(artifacts, `${certificate.reference}.pdf`);
 for (let i = 0; i < 100 && (!fs.existsSync(pdf) || fs.statSync(pdf).mtimeMs < downloadedSince); i++) await new Promise(r => setTimeout(r, 200));
 assert.ok(fs.existsSync(pdf) && fs.statSync(pdf).mtimeMs >= downloadedSince, 'A fresh PDF download must complete');
 assert.ok(fs.statSync(pdf).size > 10000);

 // Verify the real public endpoint while signed out; fixture PDF uses demo data only.
 const publicContext = await browser.createBrowserContext(), publicPage = await publicContext.newPage();
 await publicPage.goto(`${base}/#/verify/clearance/${'0'.repeat(64)}`, { waitUntil: 'networkidle0' });
 await publicPage.waitForFunction(() => document.body.textContent.includes('Certificate not found'));
 assert.equal(await publicPage.$('#landing-login-identifier'), null, 'Verification must not require login');
 await publicPage.setRequestInterception(true);
 publicPage.on('request', request => request.method() !== 'OPTIONS' && request.url().endsWith('/rpc/rmc_verify_clearance') ? request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ found: true, valid: true, student_name: certificate.details.student_name, school_name: certificate.details.school_name, reference: certificate.reference, period_title: certificate.details.period_title, issued_at: certificate.issued_at, cleared_at: certificate.cleared_at }) }) : request.continue());
 await publicPage.goto(`${base}/#/verify/clearance/${certificate.token}`, { waitUntil: 'networkidle0' });
 await publicPage.waitForFunction(() => document.body.textContent.includes('Valid clearance certificate'));
 for (const width of [1440, 375]) {
  await publicPage.setViewport({ width, height: 1000 });
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await publicPage.screenshot({ path: path.join(artifacts, `verify-${width}.png`), fullPage: true });
 }
 assert.deepEqual(errors, []);
 console.log('PASS OSSA release, student preview/download, A4 PDF, public verification and desktop/mobile layouts. UI uses fixtures; unknown-token verification uses the live backend.');
} finally { await browser.close(); }
