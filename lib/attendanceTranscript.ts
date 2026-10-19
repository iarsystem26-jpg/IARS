import { formatHourDuration } from './duration';
import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import { drawPdfSchoolSeal } from './pdfSchoolSeal';

export interface AttendanceTranscript {
  schoolName: string;
  student: { name: string; id: string; department: string; section: string };
  attendanceRate: number;
  sanctionHours: number;
  records: Array<{ date: string; title: string; category: string; timeIn: string; status: string; scannedBy: string }>;
  sanctions: Array<{ dateAssigned: string; reason: string; hours: number; status: string; approvedBy: string }>;
}

const navy = '#0E1B42';
const muted = '#475569';
const gold = '#B89931';
const border = '#DCE4EF';
const statusColors: Record<string, string> = {
  present: '#15803D', late: '#92400E', absent: '#B91C1C', excused: '#1D4ED8',
  active: '#B91C1C', resolved: '#15803D', waived: '#475569',
};

/** Vector text and tables keep the downloaded PDF legible on phones and in print. */
export function createAttendanceTranscript(data: AttendanceTranscript, logo: Uint8Array, generatedAt = new Date()) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = width - margin * 2;
  const schoolName = data.schoolName.trim() || 'School / branch not assigned';
  doc.setFont('helvetica', 'bold').setFontSize(17);
  const schoolLines: string[] = doc.splitTextToSize(schoolName, contentWidth - 31);
  const titleBottom = 20 + (schoolLines.length - 1) * 7;
  const headerBottom = Math.max(41, titleBottom + 21);
  const tableTop = headerBottom + 5;
  const tableBottom = height - 28;
  const generated = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(generatedAt);
  doc.setProperties({
    title: `${schoolName} Attendance & Sanction Transcript - ${data.student.id}`,
    author: schoolName,
    subject: 'System-automated student attendance and sanction record',
    creator: 'RMC Project Regalia System',
  });

  const base: UserOptions = {
    margin: { top: tableTop, bottom: 28, left: margin, right: margin },
    tableWidth: contentWidth,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: navy, lineColor: border, lineWidth: 0.2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: navy, textColor: '#FFFFFF', fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#F8FAFC' },
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
  };
  let y = tableTop;
  const table = (options: UserOptions) => {
    autoTable(doc, { ...base, startY: y, ...options });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };
  const section = (title: string, count: number) => {
    // Reserve enough room for the title, column headings, and a first row.
    if (y + 34 > tableBottom) { doc.addPage(); y = tableTop; }
    y += 9;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(navy);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(muted);
    doc.text(`${count} ${count === 1 ? 'record' : 'records'}`, width - margin, y, { align: 'right' });
    y += 4;
  };

  table({
    theme: 'plain',
    styles: { ...base.styles, fillColor: '#F1F5F9', cellPadding: 4, fontSize: 10 },
    columnStyles: { 0: { cellWidth: contentWidth / 2 }, 1: { cellWidth: contentWidth / 2 } },
    body: [
      [`Student name\n${data.student.name || 'Not provided'}`, `Student ID\n${data.student.id || 'Not provided'}`],
      [`Department\n${data.student.department || 'Not assigned'}`, `Section\n${data.student.section || 'Not assigned'}`],
    ],
  });
  y += 3;
  table({
    body: [[`Attendance rate: ${data.attendanceRate}%`, `Active sanction balance: ${formatHourDuration(data.sanctionHours)}`]],
    styles: { ...base.styles, fontStyle: 'bold', cellPadding: 4 },
    columnStyles: { 0: { cellWidth: contentWidth / 2 }, 1: { cellWidth: contentWidth / 2 } },
  });

  section('Official Attendance Log', data.records.length);
  table({
    head: [['Date', 'Activity / Ceremony', 'Category', 'Time-in', 'Status', 'Verifier / Logger']],
    body: data.records.length ? data.records.map(r => [r.date, r.title, r.category, r.timeIn, r.status.toUpperCase(), r.scannedBy])
      : [[{ content: 'No attendance records on file.', colSpan: 6, styles: { textColor: muted, halign: 'center', cellPadding: 5 } }]],
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: contentWidth - 112 }, 2: { cellWidth: 21 }, 3: { cellWidth: 22 }, 4: { cellWidth: 21 }, 5: { cellWidth: 25 } },
    didParseCell: ({ section, column, cell }) => {
      if (section === 'body' && column.index === 4) {
        cell.styles.textColor = statusColors[cell.text.join('').toLowerCase()] || navy;
        cell.styles.fontStyle = 'bold';
      }
    },
  });

  section('Sanctions & Demerits Ledger', data.sanctions.length);
  table({
    head: [['Date', 'Reason / Infraction', 'Sanction value', 'Status', 'Authorizing official']],
    body: data.sanctions.length ? data.sanctions.map(s => [s.dateAssigned, s.reason, `${s.hours > 0 ? '+' : ''}${formatHourDuration(s.hours)}`, s.status.toUpperCase(), s.approvedBy])
      : [[{ content: 'No sanctions or demerits on file.', colSpan: 5, styles: { textColor: muted, halign: 'center', cellPadding: 5 } }]],
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: contentWidth - 106 }, 2: { cellWidth: 27 }, 3: { cellWidth: 24 }, 4: { cellWidth: 32 } },
    didParseCell: ({ section, column, cell }) => {
      if (section === 'body' && column.index === 3) {
        cell.styles.textColor = statusColors[cell.text.join('').toLowerCase()] || navy;
        cell.styles.fontStyle = 'bold';
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    drawPdfSchoolSeal(doc, logo, margin, 13, 25);
    doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(navy);
    doc.text(schoolLines, margin + 31, 20, { lineHeightFactor: 7 / (17 * 25.4 / 72) });
    doc.setFontSize(10);
    doc.text('Attendance & Sanction Transcript', margin + 31, titleBottom + 7);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(muted);
    doc.text('PROJECT REGALIA  |  STUDENT RECORDS', margin + 31, titleBottom + 13);
    doc.setDrawColor(gold).setLineWidth(0.6);
    doc.line(margin, headerBottom, width - margin, headerBottom);
    doc.setDrawColor(border).setLineWidth(0.2);
    doc.line(margin, height - 23, width - margin, height - 23);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(navy);
    doc.text('SYSTEM-AUTOMATED DOCUMENT', margin, height - 18);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(muted);
    doc.text('Generated automatically by RMC Project Regalia from recorded system data.', margin, height - 13);
    doc.text(`Generated: ${generated} (Asia/Manila)`, margin, height - 8);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 8, { align: 'right' });
  }
  return doc;
}

export async function downloadAttendanceTranscript(data: AttendanceTranscript) {
  const response = await fetch(`${import.meta.env.BASE_URL}academic-seal-transparent.png`);
  if (!response.ok) throw new Error('Could not load the transcript logo.');
  const logo = new Uint8Array(await response.arrayBuffer());
  const doc = createAttendanceTranscript(data, logo);
  const studentId = (data.student.id || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
  await doc.save(`RMC_Attendance_Transcript_${studentId}.pdf`, { returnPromise: true });
}
