import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Browser-only fixtures keep this layout check independent of live attendance data.
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.evaluateOnNewDocument(() => {
    navigator.geolocation.getCurrentPosition = success => success({ coords: { latitude: 7.461692, longitude: 125.789313, accuracy: 5 } });
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    let body;
    if (pathname === '/__scanner-review') body = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="background:#f1f5f9;margin:0"><div id="root" style="padding:24px"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
      <script type="module">import '/@vite/client';import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import MayorScanner from '/views/MayorScanner.tsx';import '/index.css';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MayorScanner));</script></body></html>`;
    if (pathname === '/components/AuthContext.tsx') body = `const auth={profile:{uid:'review-mayor',name:'Mayor',role:'mayor'},isMock:true,revision:0,offlineScanner:false};export const useAuth=()=>auth;`;
    if (pathname === '/components/attendance/ScannerAvatar.tsx') body = `export default function ScannerAvatar(){return null;}`;
    if (pathname === '/lib/backend.ts') body = `const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);const event={id:'preview',title:'Campus Assembly',description:'Attendance for the morning and afternoon campus sessions.',venue:'Main gymnasium',status:'active',startTime:Date.parse(today+'T00:00:00+08:00'),endTime:Date.parse(today+'T23:59:00+08:00'),location:{lat:7.461692,lng:125.789313,radius_meters:150},geofenceEnabled:true,attendanceWindows:[{id:'morning',label:'Morning session',timeIn:'08:00',timeOut:'11:00',lateAfterMinutes:15},{id:'afternoon',label:'Afternoon session',timeIn:'13:00',timeOut:'17:00',lateAfterMinutes:15}]};export const appData={getVisibleEvents:()=>[event],getEvents:()=>[event],getVisibleStudents:()=>[]};`;
    if (pathname === '/lib/offlineAttendance.ts') body = `export const offlineRosters=async()=>[];export const offlineQueue=async()=>[];export const subscribeOfflineAttendance=()=>()=>{};export const prepareOfflineAttendance=async()=>{};export const syncOfflineAttendance=async()=>{};export const retryOfflineAttendance=async()=>{};export const removeSyncedAttendance=async()=>{};export const lookupScannerStudent=async()=>{};export const queueAttendance=async()=>{};`;
    if (body !== undefined) void request.respond({ status: 200, contentType: pathname === '/__scanner-review' ? 'text/html' : 'application/javascript', body });
    else void request.continue();
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/__scanner-review`, { waitUntil: 'networkidle0' });
  const eventButton = await page.waitForFunction(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Campus Assembly')));
  await eventButton.asElement().click();
  await page.waitForSelector('[aria-label="Attendance windows"]');
  fs.mkdirSync('artifacts', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewport({ width, height: 1000 });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await page.$eval('[role="dialog"]', element => element.scrollWidth > element.clientWidth + 2), false);
    assert.equal(await page.$eval('[role="dialog"] details', element => element.open), false);
    assert.equal(await page.$eval('[aria-label="Attendance windows"]', element => element.scrollWidth > element.clientWidth + 2), false);
    assert.ok(await page.$eval('[aria-label="Attendance windows"]', element => element.textContent.includes('8:00 AM') && element.textContent.includes('5:00 PM')));
    assert.equal(await page.$$eval('[role="dialog"] button', buttons => buttons.find(button => button.textContent.includes('Start scanning')).disabled), false);
    await page.screenshot({ path: `artifacts/scanner-event-${width}.png`, fullPage: true });
    console.log(`PASS scanner modal at ${width}px`);
  }
  await page.$eval('[role="dialog"] summary', element => element.click());
  assert.equal(await page.$eval('[role="dialog"] details', element => element.open), true);
  assert.ok(await page.$('[role="dialog"] [aria-label="Offline attendance"]'));
  assert.deepEqual(errors, []);
  console.log('PASS offline roster expansion and browser error checks');
} finally {
  let timeout;
  try {
    await Promise.race([
      browser.close(),
      new Promise(resolve => { timeout = setTimeout(() => { browser.process()?.kill(); resolve(); }, 10000); }),
    ]);
  } finally { clearTimeout(timeout); }
}
