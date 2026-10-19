import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#landing-login-identifier');
  const account = accounts.find(account => account.role === 'student');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main img[alt="Profile"]');
  // A tall image reproduces the original failure regardless of the test account's photo.
  await page.$eval('main img[alt="Profile"]', image => {
    image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="1500"><rect width="480" height="1500" fill="gold"/></svg>');
  });
  for (const [width, height] of [[320, 640], [375, 812], [480, 900], [768, 1024], [1024, 768], [1440, 900], [812, 375]]) {
    await page.setViewport({ width, height });
    await new Promise(resolve => setTimeout(resolve, 350));
    const layout = await page.evaluate(() => {
      const rect = document.querySelector('main img[alt="Profile"]').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, width: rect.width, height: rect.height };
    });
    assert.equal(layout.overflow, false, `Dashboard overflow at ${width}px`);
    assert(layout.width <= 56 && layout.height <= 56 && layout.width === layout.height, `Unbounded avatar at ${width}px: ${JSON.stringify(layout)}`);
    // Only the trigger for the current breakpoint is displayed.
    await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Notifications"]')].find(button => button.getBoundingClientRect().width > 0).click());
    await page.waitForSelector('[role="dialog"]');
    const bounds = await page.$eval('[role="dialog"]', dialog => {
      const rect = dialog.getBoundingClientRect();
      return { fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight + 1 };
    });
    assert(bounds.fits, `Notification panel exceeds ${width}x${height}`);
    await page.click('[aria-label="Close dialog"]');
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some(dialog => dialog.getBoundingClientRect().width > 0));
    console.log(`PASS dashboard avatar and notifications at ${width}x${height}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
