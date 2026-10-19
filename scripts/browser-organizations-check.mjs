import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const title = `verify-org-browser-${Date.now()}`;
const unitId = `${title}-unit`;
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const mockUpload = process.env.MOCK_ORGANIZATION_UPLOAD === '1';
if (mockUpload) {
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (request.url().includes('script.google.com/macros/') && request.method() === 'POST') {
      await request.respond({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ success: true, id: 'organization-browser-test-image', url: 'https://lh3.googleusercontent.com/d/organization-browser-test-image=w4000' }) });
    } else if (request.url().includes('organization-browser-test-image')) {
      await request.respond({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7l8AAAAASUVORK5CYII=', 'base64') });
    } else await request.continue();
  });
}
const errors = []; page.on('pageerror', e => errors.push(e.message));
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const click = async text => {
  const handle = await page.waitForFunction(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled), {}, text);
  await handle.asElement().click();
};
const input = async (label, value) => {
  const handle = await page.waitForFunction(label => {
    const el = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(label));
    return el?.control || el?.querySelector('input,textarea');
  }, {}, label);
  await handle.asElement().evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};
const choose = async (label, option) => {
  const button = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-labelledby')?.split(' ').some(id => document.getElementById(id)?.textContent === label)), {}, label);
  await button.asElement().click();
  const item = await page.waitForFunction(option => [...document.querySelectorAll('[role="option"]')].find(b => b.textContent.trim() === option), {}, option);
  await item.asElement().click();
};
let org, logoId;
const logoFile = '.organization-logo.local.png';
fs.writeFileSync(logoFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7l8AAAAASUVORK5CYII=', 'base64'));
try {
  checked(await service.from('rmc_nodes').insert({ id: unitId, data: { id: unitId, name: `${title} Department`, type: 'department' } }));
  await page.setViewport({ width: 1366, height: 950 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username); await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', el => el.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/ssg/panel?unit=${encodeURIComponent(unitId)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('button[aria-label="Add unit"]');
  await page.click('button[aria-label="Add unit"]');
  await choose('Semantic type', 'Organization');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.disabled && b.getAttribute('aria-labelledby')?.split(' ').some(id => document.getElementById(id)?.textContent === 'Organization unit'))));
  await input('Organization name', title); await input('Description', 'Temporary organization browser check');
  const file = await page.$('input[type=file]'); await file.uploadFile(logoFile);
  await choose('Self joining', 'Open — join immediately');
  await click('Save organization');
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 60000 });
  org = checked(await service.from('rmc_organizations').select('*').eq('name', title).single());
  assert.equal(org.node_id, unitId);
  await page.waitForFunction(title => [...document.querySelectorAll('h3')].some(el => el.textContent === title), {}, title);
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/hierarchy-organizations-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, { timeout: 5000 });
  await page.screenshot({ path: 'artifacts/hierarchy-organizations-mobile.png', fullPage: true });
  await page.setViewport({ width: 1366, height: 950 });
  console.log('PASS hierarchy creates organizations directly under the selected unit at desktop and phone widths');
  logoId = org.logo_url.match(/\/d\/([^=]+)/)?.[1];
  assert.ok(logoId); assert.equal(org.joining, 'open');
  console.log(`PASS organization form saves a ${mockUpload ? 'mocked upload response' : 'real Google Drive logo'}`);
  await page.goto(`${base}/#/organizations/${org.id}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(title => document.querySelector('main h1')?.textContent === title, {}, title);
  await click('Back to hierarchy');
  await page.waitForFunction(unitName => document.querySelector('#hierarchy-organizations-heading')?.parentElement?.textContent.includes(unitName), {}, `${title} Department`);
  await page.goto(`${base}/#/organizations/${org.id}`, { waitUntil: 'networkidle0' });
  console.log('PASS returning from organization management restores the selected hierarchy unit');
  await page.waitForFunction(() => [...document.querySelectorAll('main img')].some(img => img.complete && img.naturalWidth > 0), { timeout: 30000 });
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/organizations-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, { timeout: 5000 }).catch(async error => {
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0,12).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }))));
    await page.screenshot({ path: 'artifacts/organizations-mobile.png', fullPage: true }); throw error;
  });
  await page.screenshot({ path: 'artifacts/organizations-mobile.png', fullPage: true });
  console.log('PASS organization detail renders at desktop and phone widths');
  await page.setViewport({ width: 1366, height: 950 });
  await click('Create event / merit activity');
  await page.waitForSelector('#event-title');
  await choose('Activity type', 'Merit activity');
  await input('Event Title', `${title} Merit`); await input('Event Details', 'Attend all sessions for merit');
  await click('Next: Schedule');
  const date = new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  await input('Start Date', date); await input('End Date', date);
  await input('Time In 1', '08:00'); await input('Time Out 1', '10:00');
  await click('Next: Attendees'); await click('Next: Rules & Location'); await click('Next: Review');
  await click('Schedule Merit Activity');
  await page.waitForFunction(org => location.hash === `#/organizations/${org}`, { timeout: 30000 }, org.id);
  const event = checked(await service.from('rmc_events').select('data').eq('organization_id', org.id).single()).data;
  assert.equal(event.kind, 'merit'); assert.equal(event.approvalStatus, 'approved'); assert.equal(event.meritHours, 1);
  console.log('PASS organization merit event saves through the shared event form');
  await click('Settings');
  await page.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent.includes('Visible in the public')).querySelector('input').click());
  await click('Save organization'); await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  assert.ok(!checked(await anon.rpc('rmc_public_organizations')).some(o => o.id === org.id));
  console.log('PASS visibility control removes organization from public discovery');
  assert.deepEqual(errors, []);
} catch (error) {
  if (errors.length) console.error('Browser errors:', errors);
  const alerts = await page.$$eval('[role=alert]', els => els.map(el => el.textContent));
  if (alerts.length) console.error('Form errors:', alerts);
  throw error;
} finally {
  const rows = checked(await service.from('rmc_organizations').select('id,logo_url').eq('name', title));
  for (const row of rows) {
    logoId ||= row.logo_url.match(/\/d\/([^=]+)/)?.[1];
    checked(await service.from('rmc_events').delete().eq('organization_id', row.id));
    checked(await service.from('rmc_organizations').delete().eq('id', row.id));
    checked(await service.from('rmc_audit').delete().eq('target', row.id));
  }
  checked(await service.from('rmc_nodes').delete().eq('id', unitId));
  if (logoId && !mockUpload) {
    const fallback = fs.readFileSync('lib/googleDrive.ts', 'utf8').match(/DEFAULT_GOOGLE_DRIVE_GAS_URL = '([^']+)'/)[1];
    const response = await fetch(process.env.VITE_GOOGLE_DRIVE_GAS_URL || fallback, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'delete', fileId: logoId }) });
    const result = await response.json(); assert.ok(!result.error, result.error);
  }
  fs.unlinkSync(logoFile); await browser.close();
  console.log('Temporary organization and logo removed.');
}
