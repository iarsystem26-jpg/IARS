import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { calendarAgendaGroups, calendarConflicts, calendarDay, itemsOnDay, monthDays, type CalendarClosure, type CalendarItem } from './personalCalendar';
import { drawPdfSchoolSeal } from './pdfSchoolSeal';

const navy: [number, number, number] = [0, 39, 82];
const muted: [number, number, number] = [100, 116, 139];
const blue: [number, number, number] = [0, 133, 199];
const gold: [number, number, number] = [217, 143, 0];
const red: [number, number, number] = [220, 55, 55];
const stamp = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value));

export function createCalendarPdf(month: string, items: CalendarItem[], closures: CalendarClosure[], filter: string, generatedAt = Date.now(), branding?: { unitName: string; logo: Uint8Array }) {
 const doc = new jsPDF({ orientation: 'landscape', format: 'a4', compress: true });
 const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 12;
 const dates = monthDays(month);
 while (dates.length % 7) dates.push(null);
 const monthTitle = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${month}-01T12:00:00+08:00`));
 const conflicts = calendarConflicts(items), today = calendarDay(generatedAt);
 const header = (subtitle: string) => {
  doc.setFillColor(...navy).rect(0, 0, width, 34, 'F');
  doc.setFillColor(...gold).rect(0, 34, width, 1, 'F');
  const titleX = branding ? margin + 28 : margin;
  if (branding) drawPdfSchoolSeal(doc, branding.logo, margin + 1, 6, 20);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(255, 215, 90).text('IARS / ATTENDANCE', titleX, 10);
  doc.setFontSize(23).setTextColor(255, 255, 255).text(monthTitle, titleX, 22);
  if (branding) {
   doc.setFont('helvetica', 'normal').setFontSize(7);
   doc.text(doc.splitTextToSize(branding.unitName, 165).slice(0, 2), titleX, 28);
  }
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(255, 215, 90).text('SYSTEM GENERATED', width - margin, 10, { align: 'right' });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal').setFontSize(9).text(subtitle, width - margin, 23, { align: 'right' });
 };
 header('MONTHLY CALENDAR');
 doc.setFontSize(9).setTextColor(...muted).text(`${filter} | Philippine time (UTC+8)`, margin, 42);
 const cellWidth = (width - margin * 2) / 7, top = 53, cellHeight = 125 / (dates.length / 7);
 ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach((name, index) => {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...navy).text(name, margin + index * cellWidth + 3, 50);
 });
 dates.forEach((date, index) => {
  const x = margin + index % 7 * cellWidth, y = top + Math.floor(index / 7) * cellHeight;
  const dayItems = date ? itemsOnDay(items, date) : [];
  const notices = date ? closures.filter(closure => date >= closure.starts_on && date <= closure.ends_on) : [];
  doc.setDrawColor(218, 226, 235).setLineWidth(0.2).setFillColor(...(notices.length ? [255, 249, 229] : date ? [255, 255, 255] : [248, 250, 252]) as [number, number, number]).rect(x, y, cellWidth, cellHeight, 'FD');
  if (!date) return;
  if (date === today) doc.setDrawColor(...gold).setLineWidth(0.6).rect(x + 0.6, y + 0.6, cellWidth - 1.2, cellHeight - 1.2);
  doc.setTextColor(...navy).setFont('helvetica', 'bold').setFontSize(10).text(String(Number(date.slice(-2))), x + 3, y + 5);
  const entries = [...notices.map(closure => ({ title: closure.title, color: gold })), ...dayItems.map(item => ({ title: `${item.general ? 'General: ' : ''}${item.title}`, color: conflicts.has(item.id) ? red : blue }))];
  const limit = Math.max(1, Math.floor((cellHeight - 10) / 4));
  const visible = entries.length > limit ? entries.slice(0, limit - 1) : entries;
  visible.forEach((entry, row) => {
   doc.setFillColor(...entry.color).circle(x + 3.5, y + 9 + row * 4, 0.6, 'F');
   doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...navy);
   let title = entry.title;
   while (doc.getTextWidth(title) > cellWidth - 9 && title.length > 1) title = title.slice(0, -1);
   if (title !== entry.title) title = title.slice(0, -3) + '...';
   doc.text(title, x + 5.5, y + 10 + row * 4);
  });
  if (entries.length > visible.length) doc.setFontSize(7).setTextColor(...muted).text(`+${entries.length - visible.length} more - see agenda`, x + 3, y + 10 + visible.length * 4);
 });
 [[blue, 'Activity'], [gold, 'Holiday / suspension'], [red, 'Overlapping activities']].forEach(([color, label], index) => {
  const x = margin + index * 65;
  doc.setFillColor(...color as [number, number, number]).circle(x + 1, 185, 1, 'F');
  doc.setFontSize(8).setTextColor(...muted).text(String(label), x + 4, 186);
 });
 doc.text('Gold outline: today. Full titles, session times and notices appear in the following agenda.', margin, 193);
 doc.addPage(); header('DETAILED AGENDA');
 doc.setFontSize(9).setTextColor(...muted).text('Includes suspended and cancelled activities for reference; their status is shown below.', margin, 43);
 const sorted = [...items].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
 const rows: string[][] = [];
 const parentRows = new Set<number>(), childRows = new Set<number>();
 const activityRow = (item: CalendarItem) => [
  `${stamp(item.starts_at)}\nTo ${stamp(item.ends_at)}`,
  `${item.general ? 'GENERAL EVENT\n' : item.parent_event_id ? 'Specific activity: ' : ''}${item.title}${item.general ? '\nGroups the specific activities below' : `\n${item.label}`}`,
  item.venue || 'No venue specified',
  item.cancelled ? 'Cancelled' : item.kind === 'informational' ? 'Informational - no attendance required' : item.suspended ? 'Attendance suspended' : item.general ? 'General event - no attendance' : conflicts.has(item.id) ? 'Schedule conflict' : 'Scheduled',
 ];
 for (const group of calendarAgendaGroups(sorted)) {
  if (group.parent) { parentRows.add(rows.length); rows.push(activityRow(group.parent)); }
  else if (group.title) { parentRows.add(rows.length); rows.push(['', `GENERAL EVENT\n${group.title}`, '', 'Group context']); }
  for (const item of group.items) { if (group.parent || group.title) childRows.add(rows.length); rows.push(activityRow(item)); }
 }
 for (const notice of closures) rows.push([`${notice.starts_on} to ${notice.ends_on}`, notice.title, notice.reason, `${notice.kind === 'holiday' ? 'Holiday' : 'Suspension'} - affected attendance paused`]);
 autoTable(doc, { startY: 49, margin: { top: 43, bottom: 18, left: margin, right: margin },
  head: [['Schedule (UTC+8)', 'Activity / session', 'Venue / notice reason', 'Status']],
  body: rows.length ? rows : [['', 'No activities or notices for this month and filter.', '', '']],
  styles: { fontSize: 9, cellPadding: 3, textColor: navy, overflow: 'linebreak' },
  headStyles: { fillColor: navy, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 248, 252] },
  columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 90 }, 3: { cellWidth: 48 } },
  didParseCell: data => {
   if (data.section !== 'body') return;
   if (parentRows.has(data.row.index)) { data.cell.styles.fillColor = [255, 244, 213]; data.cell.styles.fontStyle = 'bold'; }
   if (childRows.has(data.row.index) && data.column.index === 1) data.cell.styles.cellPadding = { top: 3, bottom: 3, left: 7, right: 3 };
  },
  didDrawCell: data => {
   if (data.section === 'body' && childRows.has(data.row.index) && data.column.index === 1) {
    doc.setDrawColor(...gold).setLineWidth(0.7).line(data.cell.x + 3, data.cell.y, data.cell.x + 3, data.cell.y + data.cell.height);
   }
  },
 });
 const pages = doc.getNumberOfPages();
 for (let page = 1; page <= pages; page++) {
  doc.setPage(page);
  if (page > 2) header('DETAILED AGENDA / CONTINUED');
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted);
  doc.text(`Schedule snapshot | Generated ${stamp(new Date(generatedAt).toISOString())} | Export again after changes`, margin, height - 7);
  doc.text(`${page} / ${pages}`, width - margin, height - 7, { align: 'right' });
 }
 return doc;
}
