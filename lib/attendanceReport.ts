import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatManilaDateTime, formatManilaDate, formatManilaTime } from './dateTime';
import { drawPdfSchoolSeal } from './pdfSchoolSeal';

export interface ReportRecord {
  studentUid: string;
  studentId: string;
  studentName: string;
  eventTitle: string;
  status: 'present' | 'late' | 'excused' | 'absent' | 'not_recorded';
  section: string;
  level: string;
  program?: string;
  timeIn?: number;
  recordedAt: number;
}

export interface AttendanceReportOptions {
  schoolName: string;
  schoolLogo?: Uint8Array;
  scope: string;
  records: ReportRecord[];
  groupBy: 'status' | 'program' | 'section' | 'level';
  includeCharts: boolean;
  includeTables: boolean;
}

const navy: [number, number, number] = [14, 27, 66];
const muted: [number, number, number] = [100, 116, 139];
const statuses = [
  { key: 'present', label: 'Present', color: [22, 130, 87] },
  { key: 'late', label: 'Late', color: [180, 130, 20] },
  { key: 'excused', label: 'Excused', color: [37, 99, 180] },
  { key: 'absent', label: 'Absent', color: [200, 55, 55] },
  { key: 'not_recorded', label: 'No record', color: muted },
] as const;
const labelStatus = (status: ReportRecord['status']) => statuses.find(item => item.key === status)!.label;

export async function loadAttendanceReportLogo(): Promise<Uint8Array> {
  const response = await fetch(`${import.meta.env.BASE_URL}academic-seal-transparent.png`);
  if (!response.ok) throw new Error('Could not load the school logo. Please try again.');
  return new Uint8Array(await response.arrayBuffer());
}

export function createAttendanceReport(options: AttendanceReportOptions, generatedAt = Date.now()): jsPDF {
  const { records, schoolName } = options;
  const doc = new jsPDF({ compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = width - margin * 2;
  doc.setFont('helvetica', 'bold').setFontSize(16);
  const titleX = margin + (options.schoolLogo ? 29 : 0);
  const schoolLines: string[] = doc.splitTextToSize(schoolName, width - margin - titleX);
  const headerHeight = 30 + schoolLines.length * 7;
  doc.setFillColor(...navy).rect(0, 0, width, headerHeight, 'F');
  if (options.schoolLogo) {
    drawPdfSchoolSeal(doc, options.schoolLogo, margin, 7, 23);
  }
  doc.setTextColor(255, 255, 255).text(schoolLines, titleX, 13);
  doc.setFontSize(11).text('ATTENDANCE REPORT', titleX, headerHeight - 12);
  doc.setFont('helvetica', 'normal').setFontSize(8).text(`Generated ${formatManilaDateTime(generatedAt)} | Asia/Manila`, titleX, headerHeight - 6);
  doc.setFillColor(212, 175, 55).rect(0, headerHeight, width, 1.2, 'F');
  let y = headerHeight + 9;
  doc.setTextColor(...muted).setFontSize(9);
  const scopeLines: string[] = doc.splitTextToSize(options.scope, contentWidth);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 4 + 7;
  const uniqueStudents = new Set(records.map(record => record.studentUid)).size;
  const attended = records.filter(record => ['present', 'late', 'excused'].includes(record.status)).length;
  const cardWidth = (contentWidth - 8) / 3;
  [['Students', String(uniqueStudents)], ['Attendance entries', String(records.length)], ['Attendance rate', `${records.length ? (attended / records.length * 100).toFixed(1) : '0.0'}%`]].forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + 4);
    doc.setFillColor(241, 245, 249).roundedRect(x, y, cardWidth, 23, 2, 2, 'F');
    doc.setFont('helvetica', 'normal').setTextColor(...muted).setFontSize(8).text(label, x + 4, y + 7);
    doc.setTextColor(...navy).setFont('helvetica', 'bold').setFontSize(17).text(value, x + 4, y + 17);
  });
  y += 29;
  const sectionTitle = (title: string) => {
    if (y > height - 45) { doc.addPage(); y = 28; }
    doc.setTextColor(...navy).setFont('helvetica', 'bold').setFontSize(11).text(title, margin, y);
    y += 6;
  };
  sectionTitle('Attendance summary');
  autoTable(doc, {
    startY: y, margin: { top: 28, bottom: 20, left: margin, right: margin },
    head: [['Status', 'Entries', 'Share of entries']],
    body: statuses.map(item => {
      const count = records.filter(record => record.status === item.key).length;
      return [item.label, count, `${records.length ? (count / records.length * 100).toFixed(1) : '0.0'}%`];
    }),
    theme: 'striped', styles: { fontSize: 9, cellPadding: 2, textColor: navy },
    headStyles: { fillColor: navy, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  if (options.includeCharts) {
    sectionTitle(`Distribution by ${options.groupBy}`);
    const groups = new Map<string, number>();
    records.forEach(record => {
      const key = options.groupBy === 'status' ? labelStatus(record.status) : record[options.groupBy] || 'Unassigned';
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    if (!groups.size) {
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted).text('No attendance entries to visualize.', margin, y + 4);
      y += 12;
    }
    for (const [label, count] of groups) {
      if (y > height - 35) { doc.addPage(); y = 28; sectionTitle(`Distribution by ${options.groupBy} (continued)`); }
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...navy);
      const lines: string[] = doc.splitTextToSize(label, 50);
      doc.text(lines, margin, y + 4);
      doc.setFillColor(226, 232, 240).roundedRect(margin + 54, y, 95, 5, 1, 1, 'F');
      const color = statuses.find(item => item.label === label)?.color || navy;
      doc.setFillColor(color[0], color[1], color[2]).rect(margin + 54, y, 95 * count / records.length, 5, 'F');
      doc.text(`${count} (${(count / records.length * 100).toFixed(1)}%)`, width - margin, y + 4, { align: 'right' });
      y += Math.max(7, lines.length * 4 + 3);
    }
    y += 8;
  }
  if (options.includeTables) {
    sectionTitle('Detailed attendance records');
    autoTable(doc, {
      startY: y, margin: { top: 28, bottom: 20, left: margin, right: margin },
      head: [['Student / ID', 'Event / Window', 'Status', 'Section / Level', 'Date / Time in']],
      body: records.length ? records.map(record => [
        `${record.studentName}\n${record.studentId || 'No student ID'}`, record.eventTitle, labelStatus(record.status),
        [record.section, record.level].filter(Boolean).join('\n') || '-',
        `${formatManilaDate(record.recordedAt)}\n${record.timeIn ? formatManilaTime(record.timeIn) : 'Not recorded'}`,
      ]) : [[{ content: 'No attendance records match this unit and the selected filters.', colSpan: 5 }]],
      theme: 'striped', styles: { fontSize: 8, cellPadding: 2.5, textColor: navy, overflow: 'linebreak' },
      headStyles: { fillColor: navy, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [248, 250, 252] }, rowPageBreak: 'avoid',
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 53 }, 2: { cellWidth: 22 }, 3: { cellWidth: 32 }, 4: { cellWidth: 37 } },
    });
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (page > 1) {
      const continuedTitleX = margin + (options.schoolLogo ? 17 : 0);
      if (options.schoolLogo) drawPdfSchoolSeal(doc, options.schoolLogo, margin, 8, 13);
      doc.setTextColor(...navy).setFont('helvetica', 'bold').setFontSize(9);
      doc.text(doc.splitTextToSize(schoolName, width - margin - continuedTitleX).slice(0, 2), continuedTitleX, 12);
      doc.setFontSize(8).text('Attendance report | continued', continuedTitleX, 23);
    }
    doc.setDrawColor(226, 232, 240).line(margin, height - 14, width - margin, height - 14);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...muted);
    doc.text('System-generated attendance report | All times in Asia/Manila', margin, height - 9);
    doc.text(`Page ${page} of ${pageCount}`, width - margin, height - 9, { align: 'right' });
  }
  return doc;
}
