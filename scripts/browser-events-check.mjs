import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const testRole = process.env.EVENT_TEST_ROLE || 'admin';
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === testRole);
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const title = `verify-browser-event-${Date.now()}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
// DOM mode verifies the browser/database flow when headless Chrome suppresses
// native input. It does not test pointer hit targets or keyboard interaction.
const domInput = process.env.EVENT_INPUT_MODE === 'dom';
const clickElement = async element => domInput ? element.evaluate(el => el.click()) : element.click();
page.on('pageerror', e => errors.push(e.message));
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const setInput = async (selector, value) => page.$eval(selector, (input, value) => {
  Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
const clickText = async text => {
  const button = await page.waitForFunction(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text), {}, text);
  await clickElement(button.asElement());
};
try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/ssg/events/create`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#event-title');
  const actor = checked(await service.from('rmc_profiles').select('node_id').eq('profile->>username', account.username).single());
  if (testRole !== 'admin' && !actor.node_id) {
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(el => el.textContent.includes('assigned school unit is required')));
    assert.equal(await page.$eval('button[type="submit"]', el => el.disabled), true);
    console.log(`PASS ${testRole} without an assignment cannot create events`);
  } else {
  await setInput('#event-title', title);
  await setInput('#event-details', 'Browser-to-Supabase event verification');
  const rootSelector = await page.waitForFunction(() => [...document.querySelectorAll('fieldset')]
    .find(el => el.querySelector('legend')?.textContent === 'Choose recipient unit')?.querySelector('button'));
  await clickElement(rootSelector.asElement());
  await page.waitForSelector('[role="option"]');
  if (domInput) await page.$eval('[role="option"]', el => el.click());
  else await page.locator('[role="option"]').click();
  await clickText('Add recipient');
  const recipientType = await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .find(el => el.getAttribute('aria-labelledby')?.split(' ').some(id => document.getElementById(id)?.textContent === 'Recipient type')));
  await clickElement(recipientType.asElement());
  const mayors = await page.waitForFunction(() => [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim() === 'All Mayors'));
  await clickElement(mayors.asElement());
  await clickText('Add recipient');
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await setInput('#event-start-date', date); await setInput('#event-end-date', date);
  await setInput('input[id^="time-in-"]', '08:00'); await setInput('input[id^="time-out-"]', '10:00');
  await clickText('Add Attendance Window');
  await setInput('fieldset:nth-child(2) input[id^="time-in-"]', '13:00');
  await setInput('fieldset:nth-child(2) input[id^="time-out-"]', '16:00');
  if (domInput) await page.$eval('[role="switch"]', el => el.click());
  else await page.click('[role="switch"]');
  await setInput('#event-geofence-radius', '275');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Schedule Event') && !b.disabled));
  await clickText('Schedule Event');
  await page.waitForFunction(() => location.hash === '#/ssg/events', { timeout: 30000 });
  const rows = checked(await service.from('rmc_events').select('id,data').eq('data->>title', title));
  assert.equal(rows.length, 1); const { id, data } = rows[0];
  assert.equal(data.attendanceWindows.length, 2); assert.equal(data.location.radius_meters, 275);
  assert.equal(data.audienceTarget.groups.length, 2);
  assert.ok(data.audienceTarget.groups[0].startsWith('node:'));
  if (testRole !== 'admin') {
    const assigned = checked(await service.from('rmc_profiles').select('node_id').eq('id', data.created_by).single());
    assert.equal(data.scopeNodeId, assigned.node_id);
    assert.equal(data.audienceTarget.groups[0], `node:${assigned.node_id}`);
    console.log(`PASS ${testRole} can select and create only under its assigned unit`);
  }
  assert.equal(data.audienceTarget.groups[1], 'All Mayors');
  assert.ok(!data.recipientGroups[0].startsWith('node:'));
  assert.equal(data.startTime, Date.parse(`${date}T08:00:00+08:00`));
  console.log('PASS browser form saves two windows, Manila schedule, recipients, sanctions, and geofence to Supabase');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Event management filters"]');
  const section = await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Scheduled Upcoming Events')));
  await clickElement(section.asElement());
  await page.waitForSelector(`[aria-label="Open ${title} details"]`, { visible: true });
  if (domInput) await page.$eval(`[aria-label="Open ${title} details"]`, el => el.click());
  else await page.locator(`[aria-label="Open ${title} details"]`).click();
  await page.waitForSelector('[role="dialog"]');
  await clickText('Edit');
  await page.waitForSelector('#event-title');
  assert.equal(await page.$eval('#event-title', el => el.value), title);
  assert.equal(await page.$eval('#event-geofence-radius', el => el.value), '275');
  assert.ok((await page.$eval('[aria-label="Added event recipients"]', el => el.textContent)).includes('2 recipients added'));
  await setInput('#event-details', 'Updated from browser');
  await clickText('Save');
  await page.waitForFunction(() => location.hash === '#/ssg/events', { timeout: 30000 });
  const edited = checked(await service.from('rmc_events').select('data').eq('id', id).single()).data;
  assert.equal(edited.description, 'Updated from browser');
  assert.deepEqual(edited.audienceTarget.groups, data.audienceTarget.groups);
  console.log('PASS reload, reopen, edit, and save round trip');
  await page.setViewport({ width: 375, height: 900 });
  await page.goto(`${base}/#/ssg/events/${id}/edit`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#event-title');
  await page.evaluate(async () => { await document.fonts.ready; });
  fs.mkdirSync('logs', { recursive: true });
  await page.screenshot({ path: 'logs/event-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')]
    .filter(el => el.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(el).display !== 'none')
    .slice(0, 12).map(el => ({ tag: el.tagName, classes: el.className, text: el.textContent.slice(0, 80), left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, JSON.stringify(overflow));
  assert.deepEqual(errors, []);
  console.log('PASS mobile event form and no browser runtime errors');
  }
} catch (error) {
  console.log('Browser scope check state:', await page.evaluate(() => ({
    route: location.hash,
    alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent),
    recipientPicker: [...document.querySelectorAll('fieldset')].find(el => el.querySelector('legend')?.textContent === 'Choose recipient unit')?.textContent,
  })));
  throw error;
} finally {
  try { checked(await service.from('rmc_events').delete().eq('data->>title', title)); }
  finally { await browser.close(); }
  console.log('Cleaned up browser verification event.');
}
