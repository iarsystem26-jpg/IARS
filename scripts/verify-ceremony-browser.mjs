import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const title = `verify-ceremony-browser-${Date.now()}`;
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const setInput = (selector, value) => page.$eval(selector, (el, value) => {
  Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
const clickText = async text => {
  const handle = await page.waitForFunction(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled), {}, text);
  await handle.asElement().click();
};
try {
  await page.setViewport({ width: 1366, height: 950 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', el => el.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/student/ceremonies`, { waitUntil: 'networkidle0' });
  await clickText('Create Ceremony');
  await page.waitForSelector('#event-title');
  assert.match(await page.$eval('main h1', el => el.textContent), /Create Ceremony/);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Flag ceremony'))), true);
  await setInput('#event-title', title);
  await setInput('#event-details', 'Temporary ceremony verification');
  const days = [1,2].map(offset => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0,10));
  await setInput('#event-start-date', days[0]); await setInput('#event-end-date', days[1]);
  await setInput('input[id^="time-in-"]','07:00'); await setInput('input[id^="time-out-"]','08:00');
  for (const day of ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']) {
    await page.evaluate(day => { const label = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === day); const input = label.querySelector('input'); if (!input.checked) input.click(); }, day);
  }
  await clickText('Automatically predict dates');
  await page.waitForSelector(`[aria-label="Remove ${days[0]}"]`);
  await page.click(`[aria-label="Remove ${days[0]}"]`);
  await setInput('label:has(input[type="date"]) input:not([id])',days[0]);
  await clickText('Add date');
  await page.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent.trim() === 'Award merit to non-recipients who attend').querySelector('input').click());
  await page.evaluate(() => document.querySelector('[aria-label="Ceremony calendar"]').scrollIntoView({ block:'center' }));
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/ceremony-calendar-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().left < 1);
  await page.evaluate(() => document.querySelector('[aria-label="Ceremony calendar"]').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'artifacts/ceremony-calendar-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow horizontally');
  await page.setViewport({ width: 1366, height: 950 });
  await clickText('Schedule Ceremonies');
  await page.waitForFunction(() => location.hash === '#/student/ceremonies', { timeout: 30000 });
  const rows = checked(await service.from('rmc_events').select('id,data').eq('data->>title', title));
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r => r.data.startDate).sort(),days);
  assert.equal(rows[0].data.ceremony.allowVolunteerMerit,true);
  assert.equal(rows[0].data.seriesId,rows[1].data.seriesId);
  await page.goto(`${base}/#/ssg/events/${rows[0].id}/edit`, { waitUntil:'networkidle0' });
  await page.waitForSelector('#event-title');
  assert.equal(await page.$eval('main h1', el => el.textContent),'Edit Ceremony');
  await setInput('#event-details','Edited ceremony instructions');
  await clickText('Save');
  await page.waitForFunction(() => location.hash === '#/student/ceremonies', { timeout:30000 });
  assert.equal(checked(await service.from('rmc_events').select('data').eq('id',rows[0].id).single()).data.description,'Edited ceremony instructions');
  assert.deepEqual(errors,[]);
  console.log('PASS: admin navigation, ceremony mode, prediction, manual editing, mobile layout, real series save, and occurrence edit.');
} finally {
  const rows = checked(await service.from('rmc_events').select('id').eq('data->>title',title));
  if (rows.length) checked(await service.from('rmc_events').delete().in('id',rows.map(r=>r.id)));
  await browser.close();
}
