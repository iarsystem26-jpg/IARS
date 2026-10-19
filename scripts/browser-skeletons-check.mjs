// Deterministic responsive checks: no accounts, database writes, or network fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const routes = [
  ['/', 'student', false], ['/login', 'student', false], ['/register', 'student', false],
  ['/register/status', 'student', false], ['/privacy-policy', 'student', false],
  ['/verify/clearance/example', 'student', false], ['/organizations/public', 'student', false],
  ['/dashboard', 'student', true], ['/dashboard', 'admin', true],
  ['/student/qr', 'student', true], ['/student/profile', 'student', true],
  ['/student/calendar?month=2026-05', 'student', true], ['/student/calendar?month=2026-02', 'admin', true],
  ['/student/events', 'student', true], ['/student/ceremonies', 'student', true],
  ['/student/records', 'student', true], ['/student/events/example', 'student', true],
  ['/ssg/events', 'ssg', true], ['/ssg/events/create', 'ssg', true],
  ['/ssg/events/example/edit', 'admin', true], ['/ssg/ceremonies/create', 'ssg', true],
  ['/admin/calendar', 'admin', true], ['/organizations', 'student', true],
  ['/organizations/example', 'student', true], ['/organizations/example/events/create', 'student', true],
  ['/admin/hierarchy', 'admin', true], ['/ssg/panel', 'ssg', true],
  ['/admin/hierarchy/students/example', 'admin', true], ['/ssg/transfers', 'admin', true],
  ['/mayor/scan', 'mayor', true], ['/mayor/scan', 'admin', true],
  ['/admin/attendance', 'admin', true], ['/admin/controls?tab=health', 'admin', true],
  ['/admin/controls?tab=accounts', 'admin', true], ['/ossa/dashboard', 'ossa', true],
  ...['activities', 'requests', 'sanctions', 'excuses', 'corrections', 'organizations', 'clearance'].map(section => [`/ossa/dashboard/${section}`, 'ossa', true]),
];
const sizes = [320, 360, 390, 640, 768, 812, 1024, 1440, 1920];
const artifactDirectory = path.resolve('artifacts/skeletons');
const fixtureSourcePath = path.join(artifactDirectory, 'fixture.jsx');
await fs.mkdir(artifactDirectory, { recursive: true });
const server = await createServer({
  server: { port: 0, strictPort: false, open: false },
  plugins: [{
    name: 'skeleton-browser-fixture',
    configureServer(currentServer) {
      currentServer.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/__skeleton_check') return next();
        try {
          response.setHeader('Content-Type', 'text/html');
          response.end(await currentServer.transformIndexHtml('/__skeleton_check', fixtureHtml));
        } catch (error) { next(error); }
      });
    },
  }],
});
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PageSkeletonForRoute } from '/components/ui/PageLoading.tsx';
import { Page } from '/components/ui/Page.tsx';
import { AppLoading } from '/components/ui/Skeleton.tsx';
import '/index.css';
const root = createRoot(document.getElementById('root'));
window.showSkeleton = (route, role, workspace, collapsed = false, dark = false) => {
 document.documentElement.classList.toggle('dark', dark);
 const [pathname, query = ''] = route.split('?');
 const skeleton = React.createElement(AppLoading, { embedded: workspace }, React.createElement(PageSkeletonForRoute, { pathname, search: query, role }));
 const referenceClass = pathname === '/student/qr' ? 'student-qr-page' : ['/dashboard', '/student/events', '/student/ceremonies', '/student/records'].includes(pathname) ? 'max-w-6xl' : pathname === '/admin/controls' ? 'max-w-none space-y-8 px-5 py-6 sm:px-8 sm:py-8 xl:px-12' : pathname === '/admin/attendance' ? 'max-w-[1600px]' : pathname.startsWith('/ossa/dashboard') || pathname === '/ssg/events' ? 'max-w-7xl' : '';
 const reference = React.createElement(Page, { id: 'reference-page', className: referenceClass, style: { visibility: 'hidden', height: 0, paddingBlock: 0 } });
 const body = workspace ? React.createElement('div', { style: { transition: 'none' }, className: 'app-sidebar-layout min-h-dvh flex flex-col md:flex-row ' + (collapsed ? 'md:pl-20' : 'md:pl-64') },
   React.createElement('header', { className: 'md:hidden min-h-14' }, 'Navigation'),
   React.createElement('aside', { className: 'hidden md:block fixed inset-y-0 left-0 ' + (collapsed ? 'w-20' : 'w-64') }, 'Navigation'),
   React.createElement('main', { id: 'workspace-content', className: 'min-w-0 flex-1' }, skeleton, reference)) : skeleton;
 flushSync(() => root.render(body));
};
</script></body></html>`;
await fs.writeFile(fixtureSourcePath, fixture.match(/<script type="module">([\s\S]*)<\/script>/)[1]);
const fixtureHtml = fixture.replace(/<script type="module">[\s\S]*<\/script>/, '<script type="module" src="/artifacts/skeletons/fixture.jsx"></script>');
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(`Browser error: ${error.message}`); });
  await page.goto(`http://127.0.0.1:${address.port}/__skeleton_check`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof window.showSkeleton === 'function', { timeout: 120000 });
  console.log('Browser fixture ready; checking responsive layouts.');
  let checks = 0;
  for (const width of sizes) {
    await page.setViewport({ width, height: width === 812 ? 375 : width === 320 ? 568 : width < 1024 ? 740 : 900, deviceScaleFactor: 1 });
    for (const [route, role, workspace] of routes) {
      await page.evaluate((...args) => window.showSkeleton(...args), route, role, workspace);
      const measurements = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const area = document.querySelector('[data-skeleton-page]');
        const bounds = area.getBoundingClientRect();
        const pageStyle = getComputedStyle(area);
        const paddingLeft = parseFloat(pageStyle.paddingLeft);
        const paddingRight = parseFloat(pageStyle.paddingRight);
        const overflow = [...area.querySelectorAll('.app-skeleton, .app-surface')].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < bounds.left + paddingLeft - 1 || rect.right > bounds.right - paddingRight + 1 || rect.right > viewport + 1);
        }).map(element => element.className);
        const qr = document.querySelector('[data-skeleton="qr-card"] .aspect-square')?.getBoundingClientRect();
        const title = area.querySelector('.app-skeleton.max-w-sm')?.getBoundingClientRect();
        const ledger = area.querySelector('[data-skeleton="ledger"]');
        const contentBounds = document.querySelector('#workspace-content')?.getBoundingClientRect();
        const reference = document.querySelector('#reference-page');
        const referenceBounds = reference?.getBoundingClientRect();
        return { viewport, documentWidth: document.documentElement.scrollWidth, overflow,
          left: bounds.left, right: bounds.right, contentLeft: contentBounds?.left,
          padding: paddingLeft, reference: referenceBounds && { left: referenceBounds.left, right: referenceBounds.right, padding: parseFloat(getComputedStyle(reference).paddingLeft) },
          titleWidth: title?.width,
          ledger: ledger && { desktop: getComputedStyle(ledger.firstElementChild).display, mobile: getComputedStyle(ledger.lastElementChild).display },
          qr: qr && { width: qr.width, height: qr.height } };
      });
      const context = `${route} (${role}) at ${width}px`;
      assert.ok(measurements.documentWidth <= width, `Horizontal overflow: ${context}`);
      assert.deepEqual(measurements.overflow, [], `Placeholders outside page margins: ${context}`);
      if (workspace) {
        assert.ok(measurements.left >= (width >= 768 ? 256 : 0), `Page overlaps navigation: ${context}`);
        assert.ok(measurements.padding >= 16, `Missing page padding: ${context}`);
        if (!route.includes('/students/') && !route.match(/\/events\/[^/]+$/)) {
          assert.ok(Math.abs(measurements.left - measurements.reference.left) < 1 && Math.abs(measurements.right - measurements.reference.right) < 1, `Page width/margins differ from shared Page: ${context}`);
          assert.equal(measurements.padding, measurements.reference.padding, `Page padding differs from shared Page: ${context}`);
        }
      }
      if (measurements.qr) assert.ok(Math.abs(measurements.qr.width - measurements.qr.height) < 1, `QR placeholder is not square: ${context}`);
      if (measurements.titleWidth) assert.ok(measurements.titleWidth <= 384, `Skeleton width limit overridden: ${context}`);
      if (measurements.ledger) assert.equal(width < 768 ? measurements.ledger.desktop : measurements.ledger.mobile, 'none', `Table/card breakpoint mismatch: ${context}`);
      checks += 1;
      if ([390, 1440].includes(width) && ['/student/qr', '/student/calendar?month=2026-05', '/student/profile', '/dashboard', '/admin/controls?tab=health'].includes(route)) {
        await page.screenshot({ path: path.join(artifactDirectory, `${route.replace(/[^a-z0-9]+/gi, '-')}-${role}-${width}.png`), fullPage: true });
      }
    }
  }
  // Collapsed navigation, dark mode, and reduced motion use the same content margins.
  await page.setViewport({ width: 1024, height: 768 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluate(() => window.showSkeleton('/student/qr', 'student', true, true, true));
  await page.waitForFunction(() => Math.abs(document.querySelector('#workspace-content').getBoundingClientRect().left - 80) < 1);
  const reduced = await page.$eval('.app-skeleton', element => getComputedStyle(element).animationDuration);
  assert.ok(parseFloat(reduced) <= 0.001, 'Shimmer should respect reduced motion');
  const collapsed = await page.$eval('#workspace-content', element => element.getBoundingClientRect().left);
  assert.ok(Math.abs(collapsed - 80) < 1, 'Collapsed sidebar should reserve 80px');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(`Passed ${checks} route/viewport checks, collapsed navigation, dark mode, square QR, and reduced motion. Screenshots: ${artifactDirectory}`);
} finally {
  if (browser) await browser.close();
  server.httpServer?.closeAllConnections();
  await server.close();
  await fs.unlink(fixtureSourcePath).catch(() => {});
}
