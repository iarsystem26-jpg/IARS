import type { Worksheet } from 'exceljs';
import type { ReportRecord } from './attendanceReport';
import { formatManilaDate, formatManilaDateTime, formatManilaTime } from './dateTime';

export type SpreadsheetRecord = ReportRecord & { attendanceDate: number };
export interface SpreadsheetOptions {
  records: SpreadsheetRecord[];
  scope: string;
  generatedAt?: number;
}

const navy = 'FF142644';
const gold = 'FFBD963A';
const muted = 'FF64748B';
const statuses = [
  { key: 'present', label: 'Present', color: '#168257', background: 'FFE7F5EF' },
  { key: 'late', label: 'Late', color: '#B77912', background: 'FFFFF3D6' },
  { key: 'excused', label: 'Excused', color: '#2563B4', background: 'FFEAF1FD' },
  { key: 'absent', label: 'Absent', color: '#C83737', background: 'FFFCEBEB' },
  { key: 'not_recorded', label: 'No record', color: '#64748B', background: 'FFF1F5F9' },
] as const;
const statusLabel = (status: ReportRecord['status']) => statuses.find(item => item.key === status)!.label;

export function attendanceSpreadsheetRows(records: SpreadsheetRecord[]) {
  return [
    ['Event / Window', 'Student Name', 'Student ID', 'Status', 'Section', 'Level', 'Program / Strand', 'Attendance Date (Manila)', 'Time In (Manila)'],
    ...records.map(record => [record.eventTitle, record.studentName, record.studentId, statusLabel(record.status),
      record.section || 'Unassigned', record.level || 'Unassigned', record.program || 'Unassigned',
      formatManilaDate(record.attendanceDate), record.timeIn == null ? '' : formatManilaTime(record.timeIn)]),
  ];
}

export function summarizeSpreadsheet(records: SpreadsheetRecord[]) {
  const counts = statuses.map(status => ({ ...status, count: records.filter(record => record.status === status.key).length }));
  const resolved = records.length - counts[4].count;
  const attended = counts[0].count + counts[1].count;
  const groups = new Map<string, number>();
  records.forEach(record => {
    const section = record.section || 'Unassigned';
    groups.set(section, (groups.get(section) || 0) + 1);
  });
  return {
    counts, resolved, students: new Set(records.map(record => record.studentUid)).size,
    attendanceRate: resolved ? (attended + counts[2].count) / resolved : null,
    participationRate: resolved ? attended / resolved : null,
    sections: [...groups].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

// Embedded PNG charts keep the report consistent across WPS Office and Excel.
// Source counts remain available in cells on Summary and Section breakdown.
export function renderSpreadsheetCharts(records: SpreadsheetRecord[]) {
  const summary = summarizeSpreadsheet(records);
  const makeCanvas = (height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800; canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the report charts.');
    ctx.scale(2, 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 900, height);
    return { canvas, ctx };
  };
  const { canvas: donut, ctx } = makeCanvas(300);
  ctx.fillStyle = '#142644'; ctx.font = 'bold 19px Arial';
  ctx.fillText('Attendance status', 26, 32);
  ctx.fillStyle = '#64748B'; ctx.font = '13px Arial';
  ctx.fillText('Share of all exported attendance entries', 26, 54);
  let angle = -Math.PI / 2;
  ctx.lineWidth = 33;
  if (!records.length) {
    ctx.strokeStyle = '#E2E8F0'; ctx.beginPath(); ctx.arc(164, 174, 83, 0, Math.PI * 2); ctx.stroke();
  }
  summary.counts.forEach(status => {
    const arc = records.length ? status.count / records.length * Math.PI * 2 : 0;
    if (arc) { ctx.strokeStyle = status.color; ctx.beginPath(); ctx.arc(164, 174, 83, angle, angle + arc); ctx.stroke(); }
    angle += arc;
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#142644'; ctx.font = 'bold 30px Arial';
  ctx.fillText(String(records.length), 164, 174);
  ctx.font = '13px Arial'; ctx.fillStyle = '#64748B'; ctx.fillText('entries', 164, 197); ctx.textAlign = 'left';
  summary.counts.forEach((status, index) => {
    const y = 94 + index * 35;
    ctx.fillStyle = status.color; ctx.fillRect(350, y - 11, 12, 12);
    ctx.fillStyle = '#142644'; ctx.font = '15px Arial'; ctx.fillText(status.label, 379, y);
    ctx.font = 'bold 15px Arial'; ctx.fillText(String(status.count), 640, y);
    ctx.fillStyle = '#64748B'; ctx.font = '14px Arial';
    ctx.fillText(`${records.length ? (status.count / records.length * 100).toFixed(1) : '0.0'}%`, 738, y);
  });
  const { canvas: bars, ctx: bar } = makeCanvas(390);
  bar.fillStyle = '#142644'; bar.font = 'bold 19px Arial'; bar.fillText('Attendance entries by section', 26, 32);
  bar.fillStyle = '#64748B'; bar.font = '13px Arial';
  bar.fillText('Entry counts, not attendance rates. Full list: Section breakdown sheet.', 26, 54);
  const groups = summary.sections.slice(0, 10);
  if (summary.sections.length > 10) groups.push({ label: 'Other sections', count: summary.sections.slice(10).reduce((sum, group) => sum + group.count, 0) });
  const max = Math.max(1, ...groups.map(group => group.count));
  groups.forEach((group, index) => {
    const y = 81 + index * 27;
    bar.font = '13px Arial'; bar.fillStyle = '#142644';
    let label = group.label;
    while (bar.measureText(label).width > 228 && label.length > 1) label = label.slice(0, -1);
    if (label !== group.label) label = `${label.slice(0, -1)}…`;
    bar.fillText(label, 26, y + 13);
    bar.fillStyle = '#F1F5F9'; bar.fillRect(270, y, 480, 17);
    bar.fillStyle = '#BD963A'; bar.fillRect(270, y, 480 * group.count / max, 17);
    bar.fillStyle = '#142644'; bar.font = 'bold 13px Arial'; bar.fillText(String(group.count), 770, y + 13);
    bar.fillStyle = '#64748B'; bar.font = '12px Arial'; bar.fillText(`${(group.count / records.length * 100).toFixed(1)}%`, 820, y + 13);
  });
  if (!records.length) { bar.fillStyle = '#64748B'; bar.fillText('No attendance entries match the current filters.', 26, 105); }
  return { status: donut.toDataURL('image/png'), sections: bars.toDataURL('image/png') };
}

const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
function heading(sheet: Worksheet, row: number, text: string, last = 9) {
  sheet.mergeCells(row, 1, row, last);
  const cell = sheet.getCell(row, 1); cell.value = text;
  cell.fill = fill(navy); cell.font = { name: 'Calibri', bold: true, size: row === 1 ? 22 : 12, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { vertical: 'middle', wrapText: true }; sheet.getRow(row).height = row === 1 ? 44 : 30;
}
function textLine(sheet: Worksheet, row: number, text: string, height = 28) {
  sheet.mergeCells(row, 1, row, 9); sheet.getCell(row, 1).value = text;
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, color: { argb: muted } };
  sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' }; sheet.getRow(row).height = height;
}

export async function createAttendanceWorkbook(options: SpreadsheetOptions, charts: { status: string; sections: string }) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const generatedAt = options.generatedAt ?? Date.now();
  workbook.creator = 'RMC Attendance'; workbook.created = new Date(generatedAt);
  const summary = summarizeSpreadsheet(options.records);
  const sheet = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: gold } } });
  sheet.columns = Array.from({ length: 9 }, () => ({ width: 14 }));
  sheet.views = [{ showGridLines: false }];
  heading(sheet, 1, 'RMC  |  ATTENDANCE REPORT');
  textLine(sheet, 2, `Generated ${formatManilaDateTime(generatedAt)}  •  Asia/Manila`);
  textLine(sheet, 3, options.scope, Math.max(42, Math.ceil(options.scope.length / 120) * 16));
  const metrics = [
    ['Unique students', summary.students], ['Attendance entries', options.records.length],
    ['Attendance rate', summary.attendanceRate == null ? 'N/A' : summary.attendanceRate],
  ] as const;
  metrics.forEach(([label, value], index) => {
    const start = index * 3 + 1;
    sheet.mergeCells(5, start, 5, start + 2); sheet.mergeCells(6, start, 7, start + 2);
    const title = sheet.getCell(5, start); title.value = label;
    title.font = { name: 'Calibri', size: 11, color: { argb: muted } }; title.fill = fill('FFF1F5F9');
    const number = sheet.getCell(6, start); number.value = value; number.fill = fill('FFF1F5F9');
    number.font = { name: 'Calibri', bold: true, size: 26, color: { argb: navy } };
    number.alignment = title.alignment = { vertical: 'middle', horizontal: 'center' };
    if (index === 2 && typeof value === 'number') number.numFmt = '0.0%';
  });
  sheet.getRow(5).height = 24; sheet.getRow(6).height = 25; sheet.getRow(7).height = 20;
  textLine(sheet, 9, 'Attendance rate = (Present + Late + Excused) ÷ recorded entries. Entries with no record are excluded.', 32);
  textLine(sheet, 10, `Physical participation (Present + Late ÷ recorded entries): ${summary.participationRate == null ? 'N/A' : `${(summary.participationRate * 100).toFixed(1)}%`}. Excused does not mean physically present.`, 32);
  heading(sheet, 12, 'STATUS AT A GLANCE');
  ['Status', 'Entries', 'Share of all entries'].forEach((label, index) => {
    const start = index * 3 + 1; sheet.mergeCells(13, start, 13, start + 2);
    const cell = sheet.getCell(13, start); cell.value = label; cell.font = { bold: true, color: { argb: navy } };
  });
  summary.counts.forEach((status, index) => {
    const row = 14 + index; sheet.getRow(row).height = 25;
    [status.label, status.count, options.records.length ? status.count / options.records.length : 0].forEach((value, col) => {
      const start = col * 3 + 1; sheet.mergeCells(row, start, row, start + 2);
      const cell = sheet.getCell(row, start); cell.value = value; cell.fill = fill(status.background);
      cell.font = { name: 'Calibri', size: 11, color: { argb: `FF${status.color.slice(1)}` } };
      cell.alignment = { vertical: 'middle' }; if (col === 2) cell.numFmt = '0.0%';
    });
  });
  if (!options.records.length) textLine(sheet, 20, 'No attendance entries match the current filters. Adjust your filters and export again.');
  for (let row = 21; row <= 55; row++) sheet.getRow(row).height = 16;
  const statusImage = workbook.addImage({ base64: charts.status, extension: 'png' });
  const sectionImage = workbook.addImage({ base64: charts.sections, extension: 'png' });
  sheet.addImage(statusImage, 'A21:I34'); sheet.addImage(sectionImage, 'A36:I54');
  textLine(sheet, 56, 'Read Summary first. Section breakdown contains all section counts. Attendance records contains every exported entry.', 32);
  textLine(sheet, 57, 'Charts are snapshots of this export. Editing workbook cells does not update the charts.', 28);
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: 'A1:I57' };

  const breakdown = workbook.addWorksheet('Section breakdown');
  breakdown.addRow(['Section', 'Attendance entries', 'Share of all entries']);
  summary.sections.forEach(group => breakdown.addRow([group.label, group.count, group.count / options.records.length]));
  breakdown.columns = [{ width: 45 }, { width: 24 }, { width: 24, numFmt: '0.0%' }];
  const details = workbook.addWorksheet('Attendance records');
  details.addRows(attendanceSpreadsheetRows(options.records));
  details.columns.forEach((column, index) => { column.width = [55, 32, 22, 18, 24, 28, 32, 26, 23][index]; column.numFmt = '@'; });
  for (const table of [breakdown, details]) {
    table.views = [{ state: 'frozen', ySplit: 1, xSplit: table === details ? 2 : 1, showGridLines: false }];
    table.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, table.rowCount), column: table.columnCount } };
    table.getRow(1).height = 34;
    table.getRow(1).eachCell(cell => { cell.fill = fill(navy); cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { wrapText: true, vertical: 'middle' }; });
    table.eachRow((row, index) => {
      if (index === 1) return;
      // Long names and event/session titles remain visible rather than clipping.
      row.height = 36;
      row.eachCell((cell, col) => {
        row.height = Math.max(row.height!, Math.ceil(String(cell.value ?? '').length / Math.max(10, (table.getColumn(col).width || 25) - 4)) * 15 + 10);
        cell.fill = fill(index % 2 ? 'FFF1F5F9' : 'FFFFFFFF');
        cell.font = { name: 'Calibri', size: 11, color: { argb: navy } };
        cell.alignment = { wrapText: true, vertical: 'middle' };
      });
      if (table === details) {
        const status = statuses.find(item => item.label === row.getCell(4).value)!;
        row.getCell(4).fill = fill(status.background); row.getCell(4).font = { bold: true, color: { argb: `FF${status.color.slice(1)}` } };
      }
    });
    table.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    table.headerFooter.oddFooter = '&LRMC Attendance&RPage &P of &N';
  }
  details.getCell('H1').note = 'Attendance date in Asia/Manila, based on the event/session date. Time in is blank when no check-in was recorded.';
  details.getCell('C1').note = 'Student IDs are stored as text to preserve leading zeros.';
  return workbook;
}

export async function downloadAttendanceWorkbook(options: SpreadsheetOptions) {
  const charts = renderSpreadsheetCharts(options.records);
  const workbook = await createAttendanceWorkbook(options, charts);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as unknown as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `attendance_report_${formatManilaDate(options.generatedAt ?? Date.now()).replaceAll('/', '-')}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
