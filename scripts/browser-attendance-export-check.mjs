import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
fs.mkdirSync('artifacts/attendance-export', { recursive: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  assert.ok(account, 'A local demo admin account is required');
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/admin/attendance`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('button[aria-label="Export report"]');
  await page.click('button[aria-label="Export report"]');
  for (let depth = 0; depth < 8; depth++) {
    if (!await page.$eval('button[aria-label="Generate PDF report"]', button => button.disabled)) break;
    const opened = await page.evaluate(index => {
      const picker = document.querySelectorAll('[role="dialog"] button[aria-haspopup="listbox"]')[index];
      picker?.click();
      return Boolean(picker);
    }, depth);
    if (!opened) break;
    const selected = await page.evaluate(() => {
      const selection = [...document.querySelectorAll('[role="option"]')].find(option => !option.textContent.trim().startsWith('All of '));
      selection?.click();
      return Boolean(selection);
    });
    if (!selected) break;
    await new Promise(resolve => setTimeout(resolve, 400));
    if (await page.$('iframe[title="Attendance PDF preview"]')) break;
  }
  await page.waitForSelector('iframe[title="Attendance PDF preview"]', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Generate PDF report"]').disabled);
  const initialUrl = await page.$eval('iframe', frame => frame.src);
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 1000 });
    await new Promise(resolve => setTimeout(resolve, 600));
    await page.$eval('[role="dialog"]', dialog => {
      for (const element of dialog.querySelectorAll('div')) if (element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === 'auto') element.scrollTop = 0;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.equal(await page.$eval('[role="dialog"]', dialog => dialog.scrollWidth > dialog.clientWidth + 2), false);
    await page.screenshot({ path: `artifacts/attendance-export/panel-${width}.png` });
    if (width === 375) {
      await page.$eval('iframe[title="Attendance PDF preview"]', frame => frame.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: 'artifacts/attendance-export/preview-375.png' });
    }
    console.log(`PASS export modal and preview at ${width}px`);
  }
  await page.$eval('input[aria-label="Include Visualizations"]', input => input.click());
  await page.waitForFunction(url => document.querySelector('iframe[title="Attendance PDF preview"]')?.src !== url
    && !document.querySelector('button[aria-label="Generate PDF report"]').disabled, {}, initialUrl);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(errors, []);
  console.log('PASS preview refresh and modal close');
} finally {
  fs.writeFileSync('artifacts/attendance-export/browser-results.json', JSON.stringify({ errors }, null, 2));
  await browser.close();
}
