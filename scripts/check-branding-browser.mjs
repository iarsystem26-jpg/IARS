import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4178';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle0' });
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  assert.match(manifest.name, /IARS|Institution Attendance/);
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return `${image.naturalWidth}x${image.naturalHeight}`; }, icon.src);
    assert.equal(size, icon.sizes);
  }
  const logo = await page.$eval('header img[alt^="IARS"]', image => image.getAttribute('src'));
  assert.ok(logo && !logo.includes('academic-seal'));
  assert.doesNotMatch(await page.$eval('body', body => body.textContent), /\bRMC\b|Rizal Memorial/i);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.createCDPSession();
  assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
  fs.mkdirSync('artifacts/branding', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: `artifacts/branding/iars-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS IARS logos, manifest icons, PWA installability, responsive layout, and no legacy visible branding.');
} finally {
  await browser.close();
}
