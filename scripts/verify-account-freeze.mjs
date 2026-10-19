// Generated fixture accounts only; cleanup removes every fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { testStudentId } from './test-student-id.mjs';
process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = client(), student = client(), second = client();
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const owner = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const prefix = 'verify-account-freeze-' + Date.now();
const ids = [], nodes = [];
let browser;
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const freeze = (targets, frozen, reason = '') => admin.rpc('rmc_set_account_freezes', { target_ids: targets, frozen, reason });
const pass = name => console.log('PASS ' + name);
try {
  checked(await admin.auth.signInWithPassword({ email: owner.email, password: owner.password }));
  const ownerId = checked(await admin.auth.getUser()).user.id;
  const node = prefix + '-class';
  for (const [suffix, parent, type] of [['school', null, 'school'], ['department', 'school', 'department'], ['class', 'department', 'section']]) {
    const id = prefix + '-' + suffix;
    checked(await admin.rpc('rmc_command', { action: 'addSchoolNode', args: [parent ? prefix + '-' + parent : null, { id, name: 'Verification ' + suffix, type }] }));
    nodes.push(id);
  }
  const password = crypto.randomUUID() + 'Aa!';
  const profiles = ['student', 'admin'].map(role => ({
    name: 'Account freeze verification ' + role, username: prefix + '-' + role,
    email: prefix + '-' + role + '@example.test', role, student_id: testStudentId(),
    school_data: role === 'student' ? { academic_assignment: { terminalGroupId: node } } : {},
  }));
  const creation = await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: profiles.map(profile => ({ profile, password })) } } });
  if (creation.error?.context) throw new Error((await creation.error.context.json()).error || creation.error.message);
  const created = checked(creation);
  assert.equal(created.ids?.length, 2); ids.push(...created.ids);
  checked(await student.auth.signInWithPassword({ email: profiles[0].email, password }));
  checked(await second.auth.signInWithPassword({ email: profiles[1].email, password }));
  checked(await freeze([ids[0]], true, 'Single account verification'));
  assert.equal(checked(await student.rpc('rmc_snapshot')).profiles[0].account_freeze.reason, 'Single account verification');
  pass('single account freeze');
  checked(await freeze(ids, true, 'Batch account verification'));
  for (const actor of [student, second]) {
    const snapshot = checked(await actor.rpc('rmc_snapshot'));
    assert.equal(snapshot.profiles.length, 1);
    assert.equal(snapshot.profiles[0].account_freeze.reason, 'Batch account verification');
    assert.deepEqual(snapshot.events, []); assert.deepEqual(snapshot.attendance, []);
    assert.equal((await actor.from('rmc_profiles').select('*')).error?.code, '42501');
    assert.equal((await actor.rpc('rmc_set_account_freezes', { target_ids: ids, frozen: false, reason: 'Bypass' })).error?.code, '42501');
    assert.equal(checked(await actor.from('rmc_legal_pages').select('kind')).length, 4);
  }
  pass('batch freeze blocks student and admin APIs, self-unfreeze and exposes only safe status');
  const lastAdmin = await freeze([ownerId], true, 'Attempt last admin');
  assert.equal(lastAdmin.error?.code, '22023'); assert.match(lastAdmin.error.message, /at least one active admin/i);
  pass('last unfrozen admin cannot be frozen');
  if (process.env.FREEZE_BROWSER === '1') {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
    await page.goto(base + '/#/login', { waitUntil: 'networkidle0' });
    await page.type('#landing-login-identifier', profiles[1].username);
    await page.type('#landing-login-password', password);
    await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
    await page.waitForSelector('#frozen-access-title', { timeout: 30000 });
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewport({ width, height: 900 });
      for (const route of ['/admin/controls', '/dashboard', '/student/profile']) {
        await page.goto(base + '/#' + route, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#frozen-access-title');
        assert.equal(await page.$('aside, nav, #mobile-main-navigation, #desktop-main-navigation'), null);
        assert.ok((await page.evaluate(() => document.body.textContent)).includes('Your account'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      }
    }
    assert.deepEqual(errors, []);
    pass('frozen admin direct routes block navigation at mobile and desktop sizes');
    checked(await freeze(ids, false, 'Restored'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Check access again')).click());
    await page.waitForFunction(() => !document.querySelector('#frozen-access-title'));
    pass('admin recovery restores the workspace');
    await page.goto(base + '/#/admin/controls?tab=freeze', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#account-freeze-title');
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewport({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account controls overflow');
    }
    assert.deepEqual(errors, []);
    pass('account controls render without errors or horizontal overflow');
  } else checked(await freeze(ids, false, 'Restored'));
  for (const actor of [student, second]) {
    assert.equal(checked(await actor.rpc('rmc_snapshot')).profiles.find(p => p.uid === (actor === student ? ids[0] : ids[1])).account_freeze, null);
  }
  pass('batch unfreeze restores accounts');
} finally {
  if (browser) await browser.close();
  if (ids.length) await freeze(ids, false, 'Verification cleanup');
  for (const id of ids) checked(await service.auth.admin.deleteUser(id));
  for (const id of nodes.reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
}
