// Requires configured test accounts; creates only temporary events for one test student.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const adminAccount = accounts.find(account => account.role === 'admin'), studentAccount = accounts.find(account => account.role === 'student');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const checked = response => { if (response.error) throw new Error(response.error.message); return response.data; };
const prefix = `verify-calendar-${Date.now()}`, events = [], base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4175';
const date = new Date(Date.now() + 7 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
const downloadPath = path.resolve(`.calendar-download-${prefix}.local`);
fs.mkdirSync(downloadPath);
let browser;
try {
 checked(await admin.auth.signInWithPassword({ email: adminAccount.email, password: adminAccount.password }));
 const student = checked(await service.from('rmc_profiles').select('id,is_test_account').eq('profile->>username', studentAccount.username).single());
 assert.equal(student.is_test_account, true, 'Calendar fixture must target a test account');
 for (const kind of ['attendance', 'flag_ceremony', 'service', 'merit']) {
  const event = { title: `${prefix} ${kind}`, description: 'Temporary personal calendar verification', kind, status: 'upcoming', startDate: date, endDate: date,
   startTime: Date.parse(`${date}T08:00:00+08:00`), endTime: Date.parse(`${date}T10:00:00+08:00`),
   audienceTarget: { mode: 'specific_people', specificUserIds: [student.id] }, participantsType: 'specific', specificParticipants: [student.id], target: { all: false },
   penaltyValue: 0, penaltyUnit: 'hours', geofenceEnabled: false,
   attendanceWindows: [{ id: 'morning', label: 'Morning', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 }],
   ...(kind === 'merit' ? { meritHours: 0.5 } : {}), ...(kind === 'service' ? { service: { overflow: 'clear' } } : {}) };
  events.push(checked(await admin.rpc('rmc_command', { action: 'createEvent', args: [event] })));
 }
 browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
 const page = await browser.newPage(), errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
 await page.waitForSelector('#landing-login-identifier');
 await page.type('#landing-login-identifier', studentAccount.username); await page.type('#landing-login-password', studentAccount.password);
 await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
 await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
 await page.goto(`${base}/#/student/calendar`, { waitUntil: 'networkidle0' });
 await page.waitForSelector('#calendar-month');
 await page.$eval('#calendar-month', (input, month) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, month);
  input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
 }, date.slice(0, 7));
 await page.waitForFunction(date => [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label')?.startsWith(date) && button.getAttribute('aria-label').includes('4 sessions')), {}, date);
 await page.evaluate(date => [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.startsWith(date)).click(), date);
 await page.waitForFunction(prefix => [...document.querySelectorAll('main article h3')].filter(heading => heading.textContent.startsWith(prefix)).length === 4, {}, prefix);
 assert.equal(await page.$$eval('main article', rows => rows.filter(row => row.textContent.includes('Schedule conflict')).length), 4);
 const client = await page.createCDPSession();
 await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });
 await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Export calendar')).click());
 await page.waitForSelector('#calendar-export-options');
 await page.evaluate(() => [...document.querySelectorAll('#calendar-export-options button')].find(button => button.textContent.includes('Download ICS')).click());
 const filename = path.join(downloadPath, `IARS-calendar-${date.slice(0, 7)}.ics`);
 for (let attempt = 0; attempt < 100 && !fs.existsSync(filename); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
 assert.ok(fs.existsSync(filename), 'Calendar download missing');
 const exported = fs.readFileSync(filename, 'utf8');
 assert.ok(exported.includes('BEGIN:VCALENDAR\r\n')); for (const id of events) assert.ok(exported.includes(id), 'Export omitted a fixture');
 await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Export calendar')).click());
 await page.waitForSelector('#calendar-export-options');
 await page.evaluate(() => [...document.querySelectorAll('#calendar-export-options button')].find(button => button.textContent.includes('Download PDF')).click());
 const pdf = path.join(downloadPath, `IARS-calendar-${date.slice(0, 7)}.pdf`);
 for (let attempt = 0; attempt < 100 && !fs.existsSync(pdf); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
 assert.ok(fs.existsSync(pdf), 'Calendar PDF download missing');
 assert.ok(fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-');
 fs.copyFileSync(pdf, '.calendar-export.local.pdf');
 await page.evaluate(() => document.querySelectorAll('button[aria-label^="Dismiss"]').forEach(button => button.click()));
 for (const width of [375, 1280]) for (const dark of [false, true]) {
  await page.setViewport({ width, height: 1000 }); await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await page.screenshot({ path: `.calendar-populated-${width}-${dark ? 'dark' : 'light'}.local.png`, fullPage: true });
 }
 await page.evaluate(prefix => [...document.querySelectorAll('main article')].find(row => row.querySelector('h3')?.textContent === `${prefix} attendance`).querySelector('button').click(), prefix);
 await page.waitForSelector('[role="dialog"]');
 assert.ok(await page.$eval('[role="dialog"]',dialog => dialog.textContent.includes('Description & instructions') && dialog.textContent.includes('Attendance windows') && dialog.textContent.includes('Unexcused absence') && dialog.textContent.includes('Temporary personal calendar verification')));
 for (const width of [375,1280]) for (const dark of [false,true]) {
  await page.setViewport({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await page.$eval('[role="dialog"]',dialog=>dialog.scrollWidth>dialog.clientWidth+2),false);
  await page.screenshot({path:`.calendar-details-${width}-${dark?'dark':'light'}.local.png`});
  await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] h3')].find(node=>node.textContent==='Attendance & sanction rules').scrollIntoView({block:'center'}));
  await page.screenshot({path:`.calendar-details-rules-${width}-${dark?'dark':'light'}.local.png`});
  await page.evaluate(()=>document.querySelector('[role="dialog"] img')?.scrollIntoView());
 }
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Close details').click());
 assert.deepEqual(errors, []);
 console.log('PASS: authenticated calendar, four activity categories, conflicts, real iCalendar download, mobile/desktop, light/dark, and browser errors');
} finally {
 if (browser) await browser.close();
 if (events.length) {
  for (const id of events) checked(await service.from('rmc_notifications').delete().like('source', `event:${id}:%`));
  checked(await service.from('rmc_events').delete().in('id', events));
 }
 await admin.auth.signOut();
 // Downloads and screenshots stay in ignored local artifacts; audit history is retained.
 console.log('Cleaned up temporary calendar events.');
}
