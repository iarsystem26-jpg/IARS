// Isolated test units/accounts only. No real school or master freeze is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { testStudentId } from './test-student-id.mjs';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const url = process.env.SUPABASE_URL;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = client(), student = client();
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const owner = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const prefix = `verify-freeze-${Date.now()}`;
const nodes = [], users = [], files = [];
let browser;
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const command = async (action, args) => checked(await admin.rpc('rmc_command', { action, args }));
const pass = name => console.log(`PASS ${name}`);
const denied = (result, name) => { assert.equal(result.error?.code, '42501', name); assert.match(result.error.message, /frozen/i); pass(name); };

try {
  checked(await admin.auth.signInWithPassword({ email: owner.email, password: owner.password }));
  for (const [suffix, parent, type] of [['school', null, 'school'], ['department', 'school', 'department'], ['class', 'department', 'section']]) {
    const id = `${prefix}-${suffix}`;
    await command('addSchoolNode', [parent ? `${prefix}-${parent}` : null, { id, name: suffix === 'department' ? 'Verification department' : 'Verification class', type }]);
    nodes.push(id);
  }
  const password = `${crypto.randomUUID()}Aa!`;
  const profile = { name: 'Freeze verification student', username: prefix, email: `${prefix}@example.test`, student_id: testStudentId(), role: 'student', school_data: { academic_assignment: { terminalGroupId: `${prefix}-class` } } };
  const created = checked(await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } }));
  assert.ok(created.ids?.length, created.error || 'Test account creation failed');
  users.push(...created.ids);
  checked(await student.auth.signInWithPassword({ email: profile.email, password }));
  const initial = checked(await student.rpc('rmc_snapshot'));
  assert.equal(initial.profiles[0].uid, users[0]);
  pass('active student snapshot');

  const file = `${users[0]}/photo/freeze-verification.png`;
  checked(await service.storage.from('rmc-documents').upload(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64'), { contentType: 'image/png' }));
  files.push(file);
  await command('setNodeFreezeStatus', [`${prefix}-department`, true, 'Scheduled maintenance. Contact your department office for assistance.']);
  const paused = checked(await student.rpc('rmc_snapshot'));
  assert.equal(paused.profiles.length, 1);
  for (const key of ['events', 'attendance', 'applications', 'excuses', 'organizations', 'sanctions']) assert.deepEqual(paused[key], [], `${key} must be cleared`);
  assert.equal(paused.settings.frozen_nodes[`${prefix}-department`].isFrozen, true);
  assert.equal(paused.profiles[0].guardian, undefined);
  pass('frozen snapshot exposes only status and identity');
  assert.equal(checked(await student.from('rmc_legal_pages').select('kind,title')).length, 4);
  pass('frozen account can read all four public legal documents');
  denied(await student.from('rmc_legal_pages').update({ title: 'Attempted frozen edit' }).eq('kind', 'privacy'), 'frozen legal editing rejected');
  for (const table of ['rmc_profiles', 'rmc_attendance', 'rmc_events', 'rmc_settings']) denied(await student.from(table).select('*'), `direct ${table} access rejected`);
  for (const rpc of ['rmc_issue_qr', 'rmc_get_print_qr']) denied(await student.rpc(rpc), `direct ${rpc} rejected`);
  denied(await student.rpc('rmc_command', { action: 'setNodeFreezeStatus', args: [`${prefix}-department`, false, 'Attempted bypass'] }), 'self-unfreeze rejected');
  denied(await student.rpc('rmc_submit_profile_request', { kind: 'information', changes: {}, reason: 'Attempted bypass' }), 'direct profile request rejected');
  const download = await student.storage.from('rmc-documents').download(file);
  assert.ok(download.error, 'Frozen storage download must fail');
  const signed = await student.storage.from('rmc-documents').createSignedUrl(file, 60);
  assert.ok(signed.error, 'Frozen signed URL creation must fail');
  pass('private document download and signed URL creation rejected');
  checked(await admin.rpc('rmc_snapshot'));
  pass('admin recovery remains available');

  if (process.env.FREEZE_BROWSER === '1') {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
    await page.evaluateOnNewDocument(() => localStorage.setItem('iars-theme', 'light'));
    await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
    await page.type('#landing-login-identifier', profile.username);
    await page.type('#landing-login-password', password);
    await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
    await page.waitForSelector('#frozen-access-title', { timeout: 30000 });
    assert.ok(await page.$('img[alt="IARS logo"]'));
    assert.ok((await page.evaluate(() => document.body.textContent)).includes(profile.name));
    for (const path of ['/privacy-policy', '/data-deletion', '/data-privacy-agreement', '/terms-of-service']) assert.ok(await page.$(`a[href="#${path}"][target="_blank"]`));
    const popup = new Promise(resolve => page.once('popup', resolve));
    await page.click('a[href="#/privacy-policy"]');
    const legalTab = await popup;
    await legalTab.waitForSelector('h1');
    await legalTab.waitForFunction(() => !document.body.textContent.includes('Loading saved page...'));
    const legalAlerts = await legalTab.$$eval('[role="alert"]', elements => elements.map(element => element.textContent.trim()).filter(Boolean));
    assert.deepEqual(legalAlerts, [], `Public legal page alerts: ${legalAlerts.join('; ')}`);
    await legalTab.close();
    pass('logo, app identity, account name and working legal buttons');
    for (const route of ['/dashboard', '/student/profile', '/student/records', '/student/qr', '/mayor/scan', '/admin/controls']) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#frozen-access-title');
      assert.equal(await page.$('aside, nav, #mobile-main-navigation, #desktop-main-navigation'), null, 'Frozen navigation must be absent');
      pass(`frozen direct route ${route}`);
    }
    fs.mkdirSync('artifacts/freeze', { recursive: true });
    await page.waitForFunction(() => !document.querySelector('.app-toast[data-kind="success"]'));
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewport({ width, height: 900 });
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow at ${width}px`);
      await page.screenshot({ path: `artifacts/freeze/light-${width}.png`, fullPage: true });
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await new Promise(resolve => setTimeout(resolve, 350));
      await page.screenshot({ path: `artifacts/freeze/dark-${width}.png`, fullPage: true });
      pass(`responsive freeze screen at ${width}px`);
    }
    // Editing local browser state cannot change the database decision.
    const blocked = await page.evaluate(async () => {
      localStorage.setItem('rmc_regalia_db', JSON.stringify({ system_freeze: { isFrozen: false }, frozen_nodes: {} }));
      const { supabase } = await import('/lib/supabase.ts');
      const result = await supabase.from('rmc_attendance').select('*');
      return result.error?.code;
    });
    assert.equal(blocked, '42501');
    pass('local storage tampering cannot bypass API enforcement');
    assert.deepEqual(errors, []);
    await command('setNodeFreezeStatus', [`${prefix}-department`, false, '']);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Check access again')).click());
    await page.waitForFunction(() => !document.querySelector('#frozen-access-title'));
    assert.ok(await page.$('#desktop-main-navigation'));
    pass('unfreezing restores workspace and sidebar without reload');
  } else await command('setNodeFreezeStatus', [`${prefix}-department`, false, '']);
  checked(await student.from('rmc_profiles').select('id').eq('id', users[0]));
  pass('unfreezing restores direct authorized reads');
} finally {
  if (browser) await browser.close();
  // Each cleanup operation only targets this run's generated fixture IDs.
  if (nodes.includes(`${prefix}-department`)) await command('setNodeFreezeStatus', [`${prefix}-department`, false, '']).catch(() => {});
  if (files.length) checked(await service.storage.from('rmc-documents').remove(files));
  for (const id of users) checked(await service.auth.admin.deleteUser(id));
  for (const id of [...nodes].reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
}
