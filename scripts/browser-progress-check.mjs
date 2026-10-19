import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-toast-root]');
  await page.evaluate(async () => {
    const { toast, toastStore } = await import('/lib/toast.ts');
    toastStore.getSnapshot().forEach(item => toast.dismiss(item.id));
    window.progressPreview = toast.start('Upload profile photo', ['Checking your photo', 'Preparing your photo', 'Uploading your photo', 'Finishing up']);
    window.progressPreview.step(2);
    const saved = toast.start('Save contact details', ['Saving your changes', 'Updating your screen']);
    saved.step(1);
    saved.fail(new Error('network'), 'Changes saved. Could not refresh the page.');
  });
  await page.waitForSelector('[role="progressbar"][aria-valuenow="50"]');
  fs.mkdirSync('artifacts', { recursive: true });
  for (const width of [1280, 375]) {
    await page.setViewport({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    const bounds = await page.$eval('[data-toast-root]', element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(bounds.left >= 0 && bounds.right <= width);
    await page.screenshot({ path: `artifacts/progress-toasts-${width}.png` });
  }
  assert.match(await page.$eval('[role="alert"]', element => element.textContent), /Changes saved\. Could not refresh the page\.NET-001/);
  await page.click('[aria-label="Dismiss Save contact details"]');
  assert.equal(await page.$$eval('.app-toast[data-kind="error"]', elements => elements.length), 0);
  await page.evaluate(() => window.progressPreview.complete());
  await page.waitForSelector('[role="progressbar"][aria-valuenow="100"]');
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile progress, brief errors, dismissal, completion, and viewport bounds.');
} finally { await browser.close(); }
