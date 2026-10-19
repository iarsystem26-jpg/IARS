import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4176';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
 const page = await browser.newPage(); page.setDefaultNavigationTimeout(90000);
 await page.goto(`${base}/#/verify/clearance/sample`, { waitUntil: 'domcontentloaded' });
 const pdf = await page.evaluate(async () => {
  const { default: React } = await import('/node_modules/.vite/deps/react.js');
  const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
  const { default: QRCode } = await import('/node_modules/.vite/deps/react-qr-code.js');
  const { prepareClearanceCertificatePdf } = await import('/lib/clearanceCertificatePdf.ts');
  const certificate = { id: 'sample', reference: 'CLR-DEMO0000000000000000000000000000', token: 'a'.repeat(64), issued_at: '2026-10-09T08:00:00Z', cleared_at: '2026-10-09T07:00:00Z',
   details: { student_name: 'Juan Dela Cruz (Demo)', student_number: '2026-00001', school_name: 'Senior High School', period_title: 'Demonstration clearing period', starts_at: '2026-10-08T00:00:00Z', ends_at: '2026-10-10T09:00:00Z', authorized_by: 'OSSA Administrator' } };
  const url = `${location.origin}/#/verify/clearance/${certificate.token}`;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = ReactDOM.createRoot(container); root.render(React.createElement(QRCode.default || QRCode, { value: url, size: 384, level: 'M' }));
  for (let i = 0; i < 100 && !container.querySelector('svg'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const doc = await prepareClearanceCertificatePdf(certificate, container.querySelector('svg'), url);
  root.unmount(); container.remove();
  return doc.output('datauristring').split(',')[1];
 });
 fs.mkdirSync('artifacts/clearance', { recursive: true });
 fs.writeFileSync('artifacts/clearance/CLR-DEMO0000000000000000000000000000.pdf', Buffer.from(pdf, 'base64'));
 console.log('Generated updated certificate sample with embedded Old English font.');
} finally { await browser.close(); }
