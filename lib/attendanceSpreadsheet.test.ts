import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { attendanceSpreadsheetRows, createAttendanceWorkbook, summarizeSpreadsheet, type SpreadsheetRecord } from './attendanceSpreadsheet';

const time = Date.parse('2026-10-08T23:26:51Z');
const records: SpreadsheetRecord[] = ['present', 'late', 'excused', 'absent', 'not_recorded'].map((status, index) => ({
  studentUid: `student-${index % 2}`, studentName: 'Dela Cruz, Ana "Marie"', studentId: '000047',
  eventTitle: 'Intramurals / Day 1 / Morning', status: status as SpreadsheetRecord['status'],
  attendanceDate: time, timeIn: index < 2 ? time : undefined, recordedAt: time,
  section: '2SP - B', level: '2nd Year', program: 'BS Pharmacy',
}));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOfoAAAAASUVORK5CYII=';

it('counts entries separately from students and defines rates using resolved entries', () => {
  const summary = summarizeSpreadsheet(records);
  expect(summary.students).toBe(2);
  expect(summary.resolved).toBe(4);
  expect(summary.attendanceRate).toBe(0.75);
  expect(summary.participationRate).toBe(0.5);
  expect(summary.counts.map(status => status.count)).toEqual([1, 1, 1, 1, 1]);
  expect(summary.sections).toEqual([{ label: '2SP - B', count: 5 }]);
  expect(summarizeSpreadsheet([]).attendanceRate).toBeNull();
  expect(summarizeSpreadsheet([records[4]]).participationRate).toBeNull();
});

it('exports readable statuses, Manila dates, and blank times for missing check-ins', () => {
  const rows = attendanceSpreadsheetRows(records);
  expect(rows[1]).toEqual(['Intramurals / Day 1 / Morning', 'Dela Cruz, Ana "Marie"', '000047', 'Present', '2SP - B', '2nd Year', 'BS Pharmacy', '10/9/2026', '7:26:51 AM']);
  expect(rows[5][3]).toBe('No record');
  expect(rows[5][8]).toBe('');
});

it('round-trips a styled workbook with two charts, all rows, text IDs, and literal untrusted strings', async () => {
  const input = [...records, { ...records[0], studentName: '=HYPERLINK("https://example.com")', section: '' }];
  const workbook = await createAttendanceWorkbook({ records: input, scope: 'Period: All time | Events: Intramurals', generatedAt: time }, { status: png, sections: png });
  const reopened = new Workbook(); await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  expect(reopened.worksheets.map(sheet => sheet.name)).toEqual(['Summary', 'Section breakdown', 'Attendance records']);
  const summary = reopened.getWorksheet('Summary')!;
  expect(summary.getImages()).toHaveLength(2);
  expect(summary.getCell('A6').value).toBe(2);
  expect(summary.getCell('D6').value).toBe(6);
  expect(summary.getCell('G6').value).toBe(0.8);
  expect(summary.getCell('G6').numFmt).toBe('0.0%');
  const details = reopened.getWorksheet('Attendance records')!;
  expect(details.rowCount).toBe(7);
  expect(details.getCell('C2').value).toBe('000047');
  expect(details.getCell('B7').value).toBe('=HYPERLINK("https://example.com")');
  expect(details.getCell('E7').value).toBe('Unassigned');
  expect(details.getRow(1).getCell(1).font.color?.argb).toBe('FFFFFFFF');
  expect(details.views[0]).toMatchObject({ state: 'frozen', ySplit: 1, xSplit: 2 });
  expect(details.autoFilter).toBeTruthy();
  expect(details.getRow(2).height).toBeGreaterThanOrEqual(36);
  expect(reopened.getWorksheet('Section breakdown')!.getCell('B2').value).toBe(5);
});

it('creates an understandable empty workbook without invalid percentages', async () => {
  const workbook = await createAttendanceWorkbook({ records: [], scope: 'Period: custom' }, { status: png, sections: png });
  const reopened = new Workbook(); await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  expect(reopened.getWorksheet('Summary')!.getCell('G6').value).toBe('N/A');
  expect(reopened.getWorksheet('Summary')!.getCell('A20').value).toContain('No attendance entries');
  expect(reopened.getWorksheet('Attendance records')!.rowCount).toBe(1);
});
