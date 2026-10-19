import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const student = accounts.find(a => a.role === 'student');
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const session = checked(await client.functions.invoke('rmc-login', { body: { identifier: student.username, password: student.password } }));
await client.auth.setSession(session);
const uid = (await client.auth.getUser()).data.user.id;
const prefix = `verify-notices-${Date.now()}`;
let browser;
try {
  const other = checked(await service.from('rmc_profiles').select('id').neq('id', uid).limit(1))[0].id;
  const rows = Array.from({ length: 30 }, (_, i) => ({ user_id: uid, source: `${prefix}:${i}`, title: `${prefix} Update ${i}`, detail: 'Notification integration test', path: '/student/profile' }));
  const own = checked(await service.from('rmc_notifications').insert(rows).select());
  checked(await service.from('rmc_notifications').insert({ ...rows[0], user_id: other, source: `${prefix}:private`, title: 'Private account notice' }));
  const visible = checked(await client.from('rmc_notifications').select('*').like('source', `${prefix}%`));
  assert.equal(visible.length, 30); assert.ok(visible.every(row => row.user_id === uid));
  const denied = await client.from('rmc_notifications').update({ title: 'Forged content' }).eq('id', own[0].id);
  assert.ok(denied.error);
  assert.ok((await client.from('rmc_notifications').insert(rows[0])).error);
  checked(await client.from('rmc_notifications').update({ read_at: new Date().toISOString() }).eq('id', own[0].id));
  assert.ok(checked(await client.from('rmc_notifications').select('read_at').eq('id', own[0].id).single()).read_at);
  const outsiders = checked(await client.from('rmc_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', other).select());
  assert.equal(outsiders.length, 0);
  console.log('PASS account isolation, immutable content, and persisted read status');
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000'}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', student.username); await page.type('#landing-login-password', student.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.waitForFunction(() => document.querySelector('[data-toast-root]')?.textContent.includes('Welcome back,'));
  console.log('PASS welcome notification appears on login');
  await page.waitForSelector('button[aria-label="Notifications"]');
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Notifications"]')].find(el => el.getBoundingClientRect().width > 0).click());
  await page.waitForSelector('[role="dialog"] input[type="search"]');
  await page.$eval('[aria-label="Search notifications"]', (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, prefix);
  await page.waitForFunction(() => document.querySelector('[aria-label="Notification list"] ul')?.children.length === 30);
  for (const width of [1280, 375]) {
    await page.setViewport({ width, height: 700 });
    await page.waitForFunction(() => {
      const bell = [...document.querySelectorAll('button[aria-label="Notifications"]')].find(el => el.getBoundingClientRect().width > 0);
      return Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().top - bell.getBoundingClientRect().bottom - 12) < 2;
    });
    const layout = await page.evaluate(() => {
      const list = document.querySelector('[aria-label="Notification list"]');
      const search = document.querySelector('[aria-label="Search notifications"]');
      const top = search.getBoundingClientRect().top;
      list.scrollTop = list.scrollHeight;
      const dialog = document.querySelector('[role="dialog"]');
      const bounds = dialog.getBoundingClientRect();
      return { scrolling: list.scrollHeight > list.clientHeight, fixedSearch: top === search.getBoundingClientRect().top,
        animation: getComputedStyle(dialog).animationName,
        overflow: bounds.left < 0 || bounds.right > innerWidth + 2 || dialog.scrollWidth > dialog.clientWidth + 2 };
    });
    assert.ok(layout.scrolling); assert.ok(layout.fixedSearch); assert.equal(layout.overflow, false);
    assert.equal(layout.animation, 'notificationEnter');
  }
  console.log('PASS desktop/mobile modal search and list-only scrolling');
  // A server INSERT must appear while the modal is open, without a page reload.
  checked(await service.from('rmc_notifications').insert({ ...rows[0], source: `${prefix}:live`, title: `${prefix} Realtime arrival` }));
  await page.waitForFunction(prefix => document.querySelector('[data-toast-root]')?.textContent.includes(`${prefix} Realtime arrival`), { timeout: 12000 }, prefix);
  await page.waitForFunction(() => document.querySelector('[aria-label="Notification list"] ul')?.children.length === 31);
  console.log('PASS live Supabase delivery, popup, and inbox refresh');
  await page.screenshot({ path: '.notification-modal.local.png' });
  await page.$eval('[aria-label="Close dialog"]', button => button.click());
  const closing = await page.$eval('[role="dialog"]', panel => ({ state: panel.dataset.state, animation: getComputedStyle(panel).animationName }));
  assert.equal(closing.state, 'closing'); assert.equal(closing.animation, 'notificationExit');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  console.log('PASS panel position below the bell and opening/closing animations');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  checked(await service.from('rmc_notifications').delete().like('source', `${prefix}%`));
  await client.auth.signOut();
}
