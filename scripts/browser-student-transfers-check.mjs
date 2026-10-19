import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
fs.mkdirSync('artifacts/student-transfers', { recursive: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // Exercise navigation and previews only; never submit a transfer in this check.
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/ssg/panel`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('main button')).some(node => node.textContent.trim() === 'Transfer students'), { timeout: 30000 });
  const clickButton = async name => {
    const buttons = await page.$$('main button');
    for (const button of buttons) {
      if ((await button.evaluate(node => node.textContent.trim())) === name) { await button.click(); return; }
    }
    throw new Error(`Button not found: ${name}`);
  };
  await clickButton('Transfer students');
  await page.waitForFunction(() => location.hash.startsWith('#/ssg/transfers'));
  await page.waitForSelector('aside[aria-label="Transfer instructions"]');
  assert.equal(await page.$('[role="dialog"]'), null);
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="status"]')).some(node => node.textContent.includes('Loading students')));
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label^="Dismiss "]').forEach(button => button.click());
    document.documentElement.classList.remove('dark');
  });
  await page.setViewport({ width: 1440, height: 1000 });
  let levelsChosen = 0;
  for (let depth = 0; depth < 12; depth++) {
    const triggers = await page.$$('fieldset[aria-label="Student filters"] button[aria-haspopup="listbox"]');
    if (depth >= triggers.length) break;
    await triggers[depth].click();
    await page.waitForSelector('[role="option"]');
    const options = await page.$$('[role="option"]');
    const choice = (await Promise.all(options.map(async option => ({ option, text: await option.evaluate(node => node.textContent) })))).find(item => !item.text.startsWith('All of'));
    assert.ok(choice, 'Each hierarchy level must have a directory choice');
    await choice.option.click();
    levelsChosen++;
  }
  assert.ok(levelsChosen > 2, 'The enrollment picker must expose nested unit and class choices');
  await page.waitForSelector('[aria-label="Selected academic path"]');
  await page.screenshot({ path: 'artifacts/student-transfers/hierarchy-filter-1440.png', fullPage: true });
  await clickButton('All units in your scope');
  assert.equal(await page.$('[aria-label="Selected academic path"]'), null);
  console.log('PASS cascading academic filter and reset');
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 1000 });
    for (const method of ['manual', 'spreadsheet']) {
      await clickButton(method === 'manual' ? 'Select students' : 'Use a spreadsheet');
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${method} overflows at ${width}px`);
      await page.screenshot({ path: `artifacts/student-transfers/${method}-${width}.png`, fullPage: true });
      console.log(`PASS ${method} at ${width}px`);
    }
  }
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/student-transfers/spreadsheet-dark-1440.png', fullPage: true });
  await clickButton('Back to directory');
  await page.waitForFunction(() => location.hash.startsWith('#/ssg/panel'));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
