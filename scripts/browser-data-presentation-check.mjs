import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [], checks = [];
fs.mkdirSync('artifacts/data-presentation', { recursive: true });
try {
  const page = await browser.newPage();
  let snapshot;
  page.on('response', async response => {
    if (response.url().includes('/rest/v1/rpc/rmc_snapshot') && response.ok()) {
      snapshot = await response.json().catch(() => null);
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(row => row.role === 'admin');
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  for (let attempt = 0; !snapshot && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(snapshot, 'The signed-in workspace snapshot must load');
  const section = snapshot.nodes.find(node => ['section', 'block'].includes(node.data.type) && snapshot.profiles.some(profile => profile.school_data?.academic_assignment?.terminalGroupId === node.id || profile.school_data?.section === node.data.name));
  const general = snapshot.events.find(event => event.isGeneralEvent && snapshot.events.some(child => child.parentEventId === event.id));
  const targets = { section: section?.id, general: general?.id };
  const routes = [
    ['attendance', '/admin/attendance', 'Admin attendance pagination'],
    ['sanctions', '/ossa/dashboard', 'Sanction roster pagination'],
    ...(targets.section ? [['personnel', `/ssg/panel?unit=${encodeURIComponent(targets.section)}`, 'Personnel registry pagination']] : []),
    ...(targets.general ? [['general-event', `/ssg/events/${targets.general}`, null]] : []),
  ];
  for (const [name, route, pagination] of routes) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('main h1');
    if (pagination) await page.waitForSelector(`nav[aria-label="${pagination}"]`);
    for (const width of [1440, 375]) {
      await page.setViewport({ width, height: 1000 });
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name} overflows at ${width}px`);
      await page.screenshot({ path: `artifacts/data-presentation/${name}-${width}.png`, fullPage: true });
      if (pagination) {
        const next = await page.$(`nav[aria-label="${pagination}"] button[aria-label="Next page"]`);
        if (next && !await next.evaluate(button => button.disabled)) {
          await next.click();
          assert.ok(await page.$eval(`nav[aria-label="${pagination}"]`, node => node.textContent.includes('Page 2')));
          await page.click(`nav[aria-label="${pagination}"] button[aria-label="Previous page"]`);
        }
      }
      if (name === 'sanctions') {
        const buttons = await page.$$('button[aria-label^="Manage "]');
        const visible = await Promise.all(buttons.map(async button => await button.isVisible()));
        const button = buttons[visible.findIndex(Boolean)];
        if (button) {
          await button.click(); await page.waitForSelector('[role="dialog"]');
          await page.waitForSelector('nav[aria-label="Sanction history pagination"]');
          await new Promise(resolve => setTimeout(resolve, 500));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
          await page.screenshot({ path: `artifacts/data-presentation/full-record-${width}.png`, fullPage: true });
          await page.keyboard.press('Escape');
        }
      }
      if (name === 'general-event') {
        const buttons = await page.$$('main button');
        for (const button of buttons) {
          if ((await button.evaluate(node => node.textContent)).includes('View activity details')) {
            await button.click(); await page.waitForSelector('[role="dialog"]');
            await new Promise(resolve => setTimeout(resolve, 500));
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
            await page.screenshot({ path: `artifacts/data-presentation/activity-details-${width}.png`, fullPage: true });
            await page.keyboard.press('Escape'); break;
          }
        }
      }
      checks.push(`${name} at ${width}px`); console.log(`PASS ${checks.at(-1)}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync('artifacts/data-presentation/browser-results.json', JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
