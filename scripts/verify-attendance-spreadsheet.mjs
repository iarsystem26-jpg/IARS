import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';

const directory = 'artifacts/attendance-spreadsheet';
fs.mkdirSync(directory, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { renderSpreadsheetCharts, createAttendanceWorkbook } = await import('/lib/attendanceSpreadsheet.ts');
    const time = Date.parse('2026-10-09T00:26:51Z');
    const records = Array.from({ length: 36 }, (_, index) => ({
      studentUid: `sample-${index % 18}`, studentId: `000${String(index % 18).padStart(3, '0')}`,
      studentName: `Sample Student ${index % 18 + 1}`, eventTitle: 'Intramurals / Day 1 / Morning session',
      status: index < 23 ? 'present' : index < 28 ? 'late' : index < 30 ? 'excused' : index < 34 ? 'absent' : 'not_recorded',
      section: ['2SP - A', '2SP - B', '1SP - A'][index % 3], level: '2nd Year', program: 'BS Pharmacy',
      attendanceDate: time, timeIn: index < 28 ? time : undefined, recordedAt: time,
    }));
    const charts = renderSpreadsheetCharts(records);
    const workbook = await createAttendanceWorkbook({ records, scope: 'Period: October 9, 2026 | Events: Intramurals | Program: BS Pharmacy (fictional sample data)', generatedAt: time }, charts);
    const buffer = await workbook.xlsx.writeBuffer();
    let binary = ''; for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    const manySections = renderSpreadsheetCharts(records.map((record, index) => ({ ...record, section: `Very long section label ${index} with a unique name` })));
    const empty = renderSpreadsheetCharts([]);
    return { charts, manySections, empty, workbook: btoa(binary) };
  });
  fs.writeFileSync(`${directory}/sample-attendance-report.xlsx`, Buffer.from(result.workbook, 'base64'));
  for (const [variant, charts] of Object.entries({ sample: result.charts, 'many-sections': result.manySections, empty: result.empty })) {
    for (const [name, data] of Object.entries(charts)) fs.writeFileSync(`${directory}/${variant}-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(`${directory}/sample-attendance-report.xlsx`);
  assert.equal(workbook.getWorksheet('Summary').getImages().length, 2);
  assert.equal(workbook.getWorksheet('Summary').getCell('A6').value, 18);
  assert.equal(workbook.getWorksheet('Summary').getCell('D6').value, 36);
  assert.equal(workbook.getWorksheet('Attendance records').rowCount, 37);
  assert.equal(workbook.getWorksheet('Attendance records').getCell('C2').value, '000000');
  assert.equal(workbook.getWorksheet('Attendance records').getCell('I2').value, '8:26:51 AM');
  console.log('PASS browser chart generation (normal, many sections, empty) and XLSX round-trip');
} finally { await browser.close(); }
