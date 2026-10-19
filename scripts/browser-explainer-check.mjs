import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4177';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const checks = [], errors = [];
const output = process.env.EXPLAINER_REVIEW_DIR || '.explainer-browser-review.local';
await fs.mkdir(output, { recursive: true });
async function open(viewport, compact = false) {
  const page = await browser.newPage();
  // Keep this media check independent of the app's installation prompt.
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); event.stopImmediatePropagation();
    });
  });
  await page.setViewport(viewport);
  page.on('pageerror', error => errors.push(error.message));
  const mediaRequests = [];
  page.on('request', request => { if (request.url().includes('.mp4')) mediaRequests.push(request.url()); });
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#explainer video');
  await page.evaluate(() => {
    window.explainerMediaEvents = [];
    const video = document.querySelector('#explainer video');
    for (const type of ['loadstart', 'loadedmetadata', 'play', 'playing', 'pause', 'error', 'emptied']) {
      video.addEventListener(type, () => window.explainerMediaEvents.push({ type, time: video.currentTime, paused: video.paused }));
    }
  });
  assert.equal(mediaRequests.length, 0, 'Video bytes must not download before interaction.');
  assert.equal(await page.$eval('#explainer button[aria-haspopup="listbox"]', element => element.value), compact ? 'compact' : 'hd');
  await page.$eval('#explainer', element => element.scrollIntoView({ block: 'center' }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Homepage overflows horizontally.');
  const element = await page.$('#explainer');
  await element.screenshot({ path: `${output}/${viewport.width}-player.png` });
  return page;
}
async function play(page) {
  // Invoke play from one trusted gesture; clicking the video itself may also
  // toggle the browser's native controls and undo a custom click handler.
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'explainer-test-play';
    button.textContent = 'Start playback check';
    button.style.cssText = 'position:fixed;top:150px;left:10px;z-index:9999;background:white;padding:12px';
    button.onclick = () => { void document.querySelector('#explainer video').play().catch(() => {}); button.remove(); };
    document.body.append(button);
  });
  await page.click('#explainer-test-play');
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector('#explainer video');
      return video.currentTime > 0.3 && !video.paused && !video.error;
    }, { timeout: 30000 });
  } catch (error) {
    console.log('Playback state: ' + JSON.stringify(await page.$eval('video', video => ({ src: video.currentSrc, paused: video.paused, time: video.currentTime, ready: video.readyState, network: video.networkState, error: video.error?.message }))));
    throw error;
  }
  const state = await page.$eval('video', video => ({
    width: video.videoWidth, height: video.videoHeight, duration: video.duration,
    inline: video.playsInline, controls: video.controls, muted: video.muted,
  }));
  assert.equal(state.inline, true); assert.equal(state.controls, true); assert.equal(state.muted, false);
  assert.ok(Math.abs(state.duration - 60) < 0.05);
  await page.$eval('video', video => { video.textTracks[0].mode = 'showing'; });
  await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.cues?.length === 18);
  await page.$eval('video', video => { video.currentTime = 27; });
  await page.waitForFunction(() => document.querySelector('video').currentTime > 27.1);
  checks.push({ viewport: await page.viewport(), playback: state, captions: 18, seeking: true });
  return state;
}
async function selectQuality(page, label) {
  await page.click('#explainer button[aria-haspopup="listbox"]');
  await page.waitForSelector('#explainer [role="option"]');
  await page.evaluate(label => {
    const option = [...document.querySelectorAll('#explainer [role="option"]')].find(element => element.textContent.trim() === label);
    if (!option) throw new Error('Video quality option is missing.');
    option.click();
  }, label);
}
try {
  const desktop = await open({ width: 1440, height: 1000 });
  const hd = await play(desktop); assert.equal(hd.width, 1920); assert.equal(hd.height, 1080);
  await selectQuality(desktop, 'Data saver (720p)');
  await desktop.waitForFunction(() => {
    const video = document.querySelector('video');
    return video.videoWidth === 1280 && video.currentTime > 27 && !video.paused;
  });
  checks.push('Changing quality preserves playback position and resumes.');
  await selectQuality(desktop, 'HD (1080p)');
  await desktop.waitForFunction(() => document.querySelector('video').videoWidth === 1920);
  await desktop.$eval('video', video => video.dispatchEvent(new Event('error')));
  await desktop.waitForFunction(() => document.querySelector('video').videoWidth === 1280 && document.querySelector('#explainer button[aria-haspopup="listbox"]').value === 'compact');
  checks.push('HD playback error automatically selects the compatibility file.');
  await desktop.$eval('video', video => { video.pause(); video.dispatchEvent(new Event('error')); });
  await desktop.waitForSelector('#explainer [role="alert"]');
  assert.equal(await desktop.$eval('#explainer a[target="_blank"]', link => link.pathname), '/videos/iars-explainer-720p.mp4');
  await desktop.$eval('#explainer [role="alert"] button', button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await desktop.click('#explainer [role="alert"] button');
  await desktop.waitForFunction(() => !document.querySelector('#explainer [role="alert"]') && !document.querySelector('video').paused);
  checks.push('Failed compatibility playback offers an open link and working retry.');
  await desktop.close();

  const phone = await open({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true);
  const compact = await play(phone); assert.equal(compact.width, 1280); assert.equal(compact.height, 720);
  await phone.evaluate(() => { document.querySelector('video').pause(); localStorage.setItem('iars-theme', 'dark'); });
  await phone.reload({ waitUntil: 'networkidle0' });
  await phone.waitForSelector('#explainer video');
  await phone.$eval('#explainer', element => element.scrollIntoView({ block: 'center' }));
  assert.equal(await phone.evaluate(() => document.documentElement.classList.contains('dark')), true);
  await (await phone.$('#explainer')).screenshot({ path: `${output}/375-player-dark.png` });
  await phone.close();
  const tablet = await open({ width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await play(tablet); await tablet.close();
  const narrow = await open({ width: 320, height: 640, isMobile: true, hasTouch: true }, true); await narrow.close();

  const range = await fetch(`${base}/videos/iars-explainer-1080p.mp4`, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(range.status, 206); assert.equal(range.headers.get('content-type'), 'video/mp4');
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  checks.push('Production preview serves byte ranges with the correct video MIME type.');
  const caption = await fetch(`${base}/videos/iars-explainer-en.vtt`);
  assert.equal(caption.headers.get('content-type')?.split(';')[0], 'text/vtt');
  assert.ok((await caption.text()).startsWith('WEBVTT'));
  const sw = await (await fetch(`${base}/sw.js`)).text();
  assert.ok(!sw.includes('iars-explainer-1080p.mp4') && !sw.includes('iars-explainer-720p.mp4'));
  checks.push('MP4 files are excluded from service-worker precaching.');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/result.json`, JSON.stringify({ browser: await browser.version(), checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  const states = await Promise.all((await browser.pages()).map(page => page.evaluate(() => {
    const video = document.querySelector('video');
    return video ? { src: video.currentSrc, time: video.currentTime, duration: video.duration, paused: video.paused, width: video.videoWidth, ready: video.readyState, network: video.networkState, error: video.error?.message, quality: document.querySelector('#explainer button[aria-haspopup="listbox"]')?.value, failed: !!document.querySelector('#explainer [role="alert"]'), events: window.explainerMediaEvents } : null;
  })));
  console.log(JSON.stringify({ completed: checks, errors, states }, null, 2));
  throw error;
} finally { await browser.close(); }
