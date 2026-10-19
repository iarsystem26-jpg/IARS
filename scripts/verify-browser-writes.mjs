import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.server.local');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const prefix = `browser-verify-${Date.now()}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash === '#/ssg/panel', { timeout: 30000 });
  await page.locator('::-p-aria(Add unit)').click();
  await page.type('input[aria-label="Unit designation"]', prefix);
  await page.click('button[aria-label="Establish unit"]');
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Unit designation"]'));
  const nodes = await service.from('rmc_nodes').select('id').eq('data->>name', prefix);
  assert.equal(nodes.error, null); assert.equal(nodes.data.length, 1);
  console.log('PASS browser directory creation persisted exactly once');
  await page.goto(`${base}/#/ssg/events/create`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#event-title');
  await page.type('#event-title', prefix);
  await page.type('#event-details', 'Browser integration verification');
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
  await page.evaluate(date => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [selector, value] of [['#event-start-date', date], ['#event-end-date', date], ['input[type="time"]', '08:00']]) {
      const input = document.querySelector(selector); setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const out = document.querySelectorAll('input[type="time"]')[1]; setter.call(out, '09:00'); out.dispatchEvent(new Event('input', { bubbles: true }));
  }, tomorrow);
  await page.locator('::-p-aria(Add Attendance Window)').click();
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const values = ['13:00', '16:00', '08:00', '14:00'];
    document.querySelectorAll('input[type="time"]').forEach((input, index) => {
      setter.call(input, values[index]); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  await page.waitForFunction(() => document.querySelector('button[type="submit"]').disabled);
  assert.ok(await page.evaluate(() => document.body.innerText.includes('Attendance windows must not overlap.')));
  await page.evaluate(() => {
    const input = document.querySelectorAll('input[type="time"]')[3];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '10:00');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => location.hash === '#/ssg/events', { timeout: 15000 });
  const events = await service.from('rmc_events').select('id,start_at,end_at,data').eq('data->>title', prefix);
  assert.equal(events.error, null); assert.equal(events.data.length, 1);
  assert.equal(new Date(events.data[0].start_at).getTime(), new Date(`${tomorrow}T08:00:00+08:00`).getTime());
  assert.equal(new Date(events.data[0].end_at).getTime(), new Date(`${tomorrow}T16:00:00+08:00`).getTime());
  assert.deepEqual(events.data[0].data.attendanceWindows.map(w => w.timeIn), ['08:00', '13:00']);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(title => document.body.innerText.includes(title), {}, prefix);
  console.log('PASS browser overlap validation, chronological Manila windows, and event persistence after reload');
  assert.deepEqual(errors, []);
} finally {
  const { data: events } = await service.from('rmc_events').select('id').eq('data->>title', prefix);
  const { data: nodes } = await service.from('rmc_nodes').select('id').eq('data->>name', prefix);
  for (const event of events || []) { const r = await service.from('rmc_events').delete().eq('id', event.id); if (r.error) throw r.error; }
  for (const node of nodes || []) { const r = await service.from('rmc_nodes').delete().eq('id', node.id); if (r.error) throw r.error; }
  const ids = [...(events || []), ...(nodes || [])].map(row => row.id);
  if (ids.length) await service.from('rmc_audit').delete().in('target', ids);
  await browser.close();
  console.log('Removed temporary browser verification records.');
}
