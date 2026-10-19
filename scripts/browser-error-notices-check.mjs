import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  let toastModule = '/lib/toast.ts';
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/lib/toast.ts') toastModule = url.pathname + url.search; });
  await page.setViewport({ width: 1100, height: 1100 });
  await page.goto(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3009', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-toast-root]');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.evaluate(async modulePath => {
    const { toast, toastStore } = await import(modulePath);
    toastStore.getSnapshot().forEach(item => toast.dismiss(item.id));
    toast.error({ code: 'AUTH-002' });
    toast.error({ code: 'FREEZE-001' });
    toast.error({ code: 'PGRST202', status: 404 });
    toast.error({ message: 'private-server-detail', status: 500 });
  }, toastModule);
  await page.waitForSelector('.app-toast[data-owner="developer"]');
  const notices = await page.$$eval('.app-toast[data-kind="error"]', elements => elements.map(element => ({
    owner: element.dataset.owner, text: element.textContent, border: getComputedStyle(element).borderTopColor,
  })));
  for (const owner of ['user', 'school', 'developer', 'unknown']) assert(notices.some(item => item.owner === owner), owner);
  assert.equal(notices.find(item => item.owner === 'developer').border, 'rgb(220, 38, 38)');
  assert(!notices.some(item => item.text.includes('private-server-detail')));
  fs.mkdirSync('artifacts', { recursive: true });
  await (await page.$('[data-toast-root]')).screenshot({ path: 'artifacts/error-notices-light.png' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  assert.equal(await page.$eval('.app-toast[data-owner="developer"]', element => getComputedStyle(element).borderTopColor), 'rgb(248, 113, 113)');
  await (await page.$('[data-toast-root]')).screenshot({ path: 'artifacts/error-notices-dark.png' });
  await page.setViewport({ width: 390, height: 1100 });
  const bounds = await page.$eval('[data-toast-root]', element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right }; });
  assert(bounds.left >= 0 && bounds.right <= 390, 'Toast stack must fit a phone');
  await (await page.$('[data-toast-root]')).screenshot({ path: 'artifacts/error-notices-mobile.png' });
  console.log('Error colors, labels, privacy and mobile bounds passed.');
} finally { await browser.close(); }
