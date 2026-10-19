import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

// Verify the browser's actual ExcelJS bundle without signing in or changing records.
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const module = await import('/lib/studentTransfers.ts');
    const nodes = [{ id: 'campus', name: 'Sample Campus', type: 'campus', children: [
      { id: 'year-1', name: 'Year 1', type: 'year_level', children: [{ id: 'class-a', name: 'Section A', type: 'block' }] },
      { id: 'year-2', name: 'Year 2', type: 'year_level', children: [{ id: 'class-b', name: 'Section B', type: 'block' }] },
    ] }];
    const students = [{ uid: 'sample-student', name: 'Sample Student', student_id: '2025-00001', node_id: 'class-a', role: 'student' }];
    const book = await module.createTransferWorkbook(students, nodes);
    const template = await book.xlsx.writeBuffer();
    const sheet = book.getWorksheet('Students');
    sheet.getCell('E2').value = 'Section B — Sample Campus / Year 2';
    const records = await module.readTransferWorkbook(await book.xlsx.writeBuffer());
    return {
      bytes: Array.from(new Uint8Array(template)),
      hiddenReference: sheet.getColumn(6).hidden,
      validation: sheet.getCell('E2').dataValidation,
      changes: module.validateTransferRecords(records, students, nodes),
    };
  });
  assert.equal(result.hiddenReference, true);
  assert.deepEqual(result.validation.formulae, ['TransferClasses']);
  assert.equal(result.changes[0].destination_node_id, 'class-b');
  fs.mkdirSync('artifacts/student-transfers', { recursive: true });
  fs.writeFileSync('artifacts/student-transfers/easy-template-example.xlsx', Buffer.from(result.bytes));
  console.log('PASS browser workbook dropdowns, hidden references, and class-name import');
} finally {
  await browser.close();
}
