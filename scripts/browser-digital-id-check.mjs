import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Exercise the real component/export with synthetic data and no backend writes.
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const profile = {
  uid: 'digital-id-preview', name: 'Ezequiel John B. Crisostomi', role: 'mayor', student_id: '2025-00047',
  school_data: { type: 'College', department: 'College Department', level: '2nd Year BS Psych', section: '2SP - B', school_id: 'campus' },
};
const schoolName = 'Rizal Memorial Colleges, Inc., Tagum Campus';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
fs.mkdirSync('artifacts/digital-id', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('requestfailed', request => console.error(request.url(), request.failure()?.errorText));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    let body;
    if (path === '/') body = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/index.css"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      const {default: StudentQR} = await import('/views/StudentQR.tsx');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(StudentQR));
      </script></body></html>`;
    if (path === '/components/AuthContext.tsx') body = `export function useAuth() { return {profile: ${JSON.stringify(profile)}}; }`;
    if (path === '/lib/backend.ts') body = `export const appData = {
      getSchoolStructure: () => [{id:'campus',name:${JSON.stringify(schoolName)},type:'campus',children:[]}],
      issueQr: async () => ({token:'LIVE-PREVIEW-TOKEN'.repeat(16),expiresAt:Date.now()+60000}),
      getPrintQr: async () => ({token:'PRINTED-PREVIEW-TOKEN'.repeat(16)}),
      refreshPrintQr: async () => ({token:'REPLACED-PRINTED-PREVIEW-TOKEN'})
    };`;
    if (body) return request.respond({ status: 200, contentType: path === '/' ? 'text/html' : 'application/javascript', body });
    return request.continue();
  });
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('[aria-label="Student QR code for Ezequiel John B. Crisostomi"] svg');
  for (const width of [1440, 375, 320]) {
    await page.setViewport({ width, height: 1100 });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Overflow at ${width}px`);
    await page.screenshot({ path: `artifacts/digital-id/screen-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    window.__cardText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(value, x, y, maxWidth) {
      window.__cardText.push({value,x,y,width:this.measureText(value).width,maxWidth});
      return original.call(this, value, x, y, maxWidth);
    };
    HTMLAnchorElement.prototype.click = function() { window.__download = {href:this.href,filename:this.download}; };
  });
  await page.click('[aria-label="Download card as PNG"]');
  await page.waitForFunction(() => window.__download);
  const download = await page.evaluate(() => window.__download);
  assert.equal(download.filename, 'RMC_Student_QR_2025-00047.png');
  fs.writeFileSync('artifacts/digital-id/printed-id.png', Buffer.from(download.href.split(',')[1], 'base64'));
  const text = await page.evaluate(() => window.__cardText);
  assert.ok(text.some(line => line.value.includes('Tagum Campus')), 'School name should wrap on word boundaries');
  assert.ok(text.every(line => line.width <= line.maxWidth + 1), 'Printed text should fit its allotted width');
  const stress = await page.evaluate(async () => {
    const {renderDigitalId} = await import('/lib/digitalId.ts');
    const svg = document.querySelector('[aria-hidden="true"] svg');
    const canvas = await renderDigitalId({name:'Alexandria Maria Francesca Dela Cruz Montenegro Santiago',role:'admin',student_id:'2025-00047-A',school_data:{department:'Bachelor of Science in Business Administration and Financial Management',level:'Fourth Year',section:'Business Administration Section Alpha'}}, 'Rizal Memorial Colleges International Academic Learning Center and Tagum Campus', svg);
    return canvas.toDataURL();
  });
  fs.writeFileSync('artifacts/digital-id/printed-id-long-names.png', Buffer.from(stress.split(',')[1], 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS: 1440px, 375px, 320px layouts; PNG download; word wrapping; long names');
} finally {
  await browser.close();
}
