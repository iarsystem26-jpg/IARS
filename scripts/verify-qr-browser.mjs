import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const account = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'student');
const downloadPath = path.resolve('supabase/.temp/qr-downloads');
fs.mkdirSync(downloadPath, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 375, height: 812 });
  // A stalled remote logo must not prevent downloading a usable ID card.
  await page.setRequestInterception(true);
  page.on('request', request => { if (!request.url().includes('i.imgur.com')) void request.continue(); });
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true });
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier', account.username);
  await page.type('#landing-login-password', account.password);
  await page.$eval('#landing-login-password', input => input.closest('form').requestSubmit());
  await page.waitForFunction(() => location.hash !== '#/login' && document.querySelector('main'), { timeout: 40000 });
  await page.goto(`${base}/#/student/qr`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[aria-label="Download card as PNG"]')?.disabled === false, { timeout: 20000 });
  console.log('PASS: permanent QR ready on mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PNG download did not complete')), 30000);
    cdp.on('Browser.downloadProgress', event => {
      if (event.state === 'completed') { clearTimeout(timeout); resolve(); }
    });
  });
  const filename = new Promise(resolve => cdp.once('Browser.downloadWillBegin', event => resolve(event.suggestedFilename)));
  await page.$eval('[aria-label="Download card as PNG"]', button => button.click());
  await completed;
  const downloaded = fs.readFileSync(path.join(downloadPath, await filename));
  assert.equal(downloaded.subarray(1, 4).toString(), 'PNG');
  // Run the test decoder through DevTools; the app intentionally blocks inline scripts.
  await page.evaluate(fs.readFileSync('node_modules/html5-qrcode/html5-qrcode.min.js', 'utf8'));
  const token = await page.evaluate(async base64 => {
    const mount = document.createElement('div'); mount.id = 'download-qr-check'; document.body.appendChild(mount);
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const scanner = new Html5Qrcode(mount.id);
    return scanner.scanFile(new File([bytes], 'id.png', { type: 'image/png' }), false);
  }, downloaded.toString('base64'));
  assert.match(token, /^RMC1:[0-9a-f]{64}$/);
  const cameraToken = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const frame = document.createElement('canvas'); frame.width = 240; frame.height = 180;
    const context = frame.getContext('2d');
    const draw = () => {
      context.fillStyle = '#fff'; context.fillRect(0, 0, 240, 180);
      context.drawImage(image, 285, 646, 330, 330, 47, 17, 146, 146);
    };
    draw();
    const stream = frame.captureStream(12);
    const timer = setInterval(draw, 80);
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => stream;
    const mount = document.createElement('div'); mount.id = 'camera-qr-check'; mount.style.width = '240px'; document.body.appendChild(mount);
    const scanner = new Html5Qrcode(mount.id);
    let timeout;
    try {
      let resolveDecoded;
      const decoded = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Small camera frame did not decode')), 15000);
        resolveDecoded = resolve;
      });
      await scanner.start({ facingMode: 'environment' }, { fps: 12 }, value => resolveDecoded(value), () => {});
      return await decoded;
    } finally {
      clearTimeout(timeout); clearInterval(timer);
      if (scanner.isScanning) await scanner.stop();
      stream.getTracks().forEach(track => track.stop());
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      mount.remove();
    }
  }, downloaded.toString('base64'));
  assert.equal(cameraToken, token);
  assert.deepEqual(errors, []);
  console.log('PASS: mobile QR page, PNG download with stalled logo, downloaded QR decodes');
  console.log('PASS: QR scanner starts and decodes a 240 x 180 camera frame');
} finally {
  await browser.close();
}
