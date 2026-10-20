import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(item => item.role === 'admin');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (path.includes('/rest/v1/rpc/rmc_preview_unit_deletion')) console.log('Review endpoint status:', response.status());
});
const click = text => page.evaluate(text => {
  const button = [...document.querySelectorAll('[role="dialog"] button')].find(item => item.textContent.trim() === text);
  if (!button) throw Error(`Missing button: ${text}`);
  button.click();
}, text);
const overflow = () => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const rect = dialog.getBoundingClientRect();
  return dialog.scrollWidth > dialog.clientWidth + 1 || rect.left < 0 || rect.right > innerWidth + 1;
});
fs.mkdirSync('artifacts/unit-deletion', { recursive: true });
const dismissToasts = () => page.$$eval('[data-toast-root] .app-toast-dismiss', buttons => buttons.forEach(button => button.click()));
try {
  await page.setViewport({ width: 1440, height: 1050 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => !document.querySelector('#landing-login-identifier'), { timeout: 45000 });
  await page.goto(`${base}/#/admin/hierarchy`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('button[aria-label="Delete unit"]');
  await page.$eval('button[aria-label="Delete unit"]', button => button.click());
  await page.waitForSelector('[role="dialog"] input[autocomplete="current-password"]');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent.includes('Checking account security'));
  await page.evaluate(async () => { await Promise.all(document.querySelector('[role="dialog"]').getAnimations().map(animation => animation.finished)); });
  await dismissToasts();
  assert.equal(await page.$('[role="dialog"] input[type="checkbox"]'), null, 'No linked records before verification');
  await page.screenshot({ path: 'artifacts/unit-deletion/verify-desktop.png' });
  const mfa = await page.$('[role="dialog"] input[autocomplete="one-time-code"]');
  assert.equal(mfa, null, 'Browser fixture requires a test administrator without enrolled MFA');
  await page.$eval('[role="dialog"] input[autocomplete="current-password"]', (input, password) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, password);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, account.password);
  assert.ok(await page.$eval('[role="dialog"] input[autocomplete="current-password"]', input => input.value.length > 0), 'Password must be entered');
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(button => button.textContent.trim() === 'Verify and review records' && !button.disabled));
  await page.$eval('[role="dialog"] form', form => form.requestSubmit());
  await page.waitForSelector('[role="dialog"] input[aria-label="Search linked records"]', { timeout: 30000 });
  await dismissToasts();
  assert.equal(await overflow(), false, 'Desktop dialog must fit horizontally');
  assert.ok(await page.$('[role="dialog"] section[aria-label="Deletion hierarchy"]'), 'Review must show the academic hierarchy');
  assert.ok(await page.$('[role="dialog"] button[aria-expanded]'), 'Branches must expand and collapse');
  const footerVisible = await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')].find(item => item.textContent.includes('Review and confirm deletion'));
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  assert.ok(footerVisible, 'Primary action must remain visible');
  await page.$eval('section[aria-label="Deletion hierarchy"]', section => section.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'artifacts/unit-deletion/review-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.$eval('section[aria-label="Deletion hierarchy"]', section => section.scrollIntoView({ block: 'start' }));
  assert.equal(await overflow(), false, 'Mobile dialog must fit horizontally');
  await page.screenshot({ path: 'artifacts/unit-deletion/review-mobile.png' });
  await click('Cancel');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(errors, []);
  console.log('PASS: verification first, protected record loading, expandable hierarchy, visible actions, desktop/mobile layout. No deletion submitted.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/unit-deletion/failure.png' });
  console.error('Browser errors:', errors);
  console.error('Dialog:', await page.$$eval('[role="dialog"]', dialogs => dialogs.map(dialog => dialog.textContent.slice(0, 1800))));
  throw error;
} finally { await browser.close(); }
