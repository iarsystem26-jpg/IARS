import { jsPDF } from 'jspdf';
import type { ClearanceCertificate } from './clearanceCertificates';
import { formatManilaDate } from './dateTime';
import { drawPdfSchoolSeal } from './pdfSchoolSeal';

const navy = '#0E1B42', gold = '#B89931', muted = '#475569';
/** One A4 landscape page. Identity and authority come from the issued server snapshot. */
export function createClearanceCertificatePdf(c: ClearanceCertificate, qrPng: string, verificationUrl: string, logo?: Uint8Array, oldEnglishFont?: Uint8Array) {
 const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
 if (oldEnglishFont) {
  let binary = '';
  for (let offset = 0; offset < oldEnglishFont.length; offset += 8192) binary += String.fromCharCode(...oldEnglishFont.subarray(offset, offset + 8192));
  doc.addFileToVFS('UnifrakturMaguntia-Book.ttf', btoa(binary));
  doc.addFont('UnifrakturMaguntia-Book.ttf', 'OldEnglish', 'normal');
 }
 const headingFont = oldEnglishFont ? 'OldEnglish' : 'times';
 const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
 doc.setProperties({ title: `Clearance Certificate ${c.reference}`, author: c.details.school_name, subject: 'OSSA sanction clearance certificate' });
 doc.setFillColor('#FCFBF7').rect(0, 0, w, h, 'F');
 doc.setDrawColor(navy).setLineWidth(1.2).rect(9, 9, w - 18, h - 18);
 doc.setDrawColor(gold).setLineWidth(0.35).rect(12, 12, w - 24, h - 24);
 for (const [x, dx] of [[15, 10], [w - 15, -10]]) for (const [y, dy] of [[15, 10], [h - 15, -10]]) {
  doc.setDrawColor(gold).setLineWidth(0.7).line(x, y, x + dx, y).line(x, y, x, y + dy);
 }
 if (logo) drawPdfSchoolSeal(doc, logo, w / 2 - 12, 18, 24);
 const centered = (text: string, y: number, size: number, font = 'helvetica', style = 'normal', color = navy, maxWidth = w - 48) => {
  doc.setFont(font, style).setFontSize(size).setTextColor(color);
  // Long names and school labels stay within their allocated line.
  while (doc.getTextWidth(text) > maxWidth && size > 5) doc.setFontSize(--size);
  doc.text(text, w / 2, y, { align: 'center' });
 };
 centered(c.details.school_name, 51, 25, headingFont);
 centered('OFFICE OF THE STUDENTS SERVICES AND AFFAIRS', 60, 9, 'helvetica', 'normal', muted);
 doc.setDrawColor(gold).line(w / 2 - 32, 65, w / 2 + 32, 65);
 centered('Certificate of Clearance', 82, 32, headingFont);
 centered('SANCTION REQUIREMENTS', 91, 10, 'helvetica', 'bold', gold);
 centered('This is to certify that', 105, 11, 'times');
 doc.setFont(headingFont, oldEnglishFont ? 'normal' : 'bold').setFontSize(25).setTextColor(navy);
 let nameSize = 25;
 while (doc.getTextWidth(c.details.student_name) > w - 48 && nameSize > 16) doc.setFontSize(--nameSize);
 let nameLines: string[] = doc.splitTextToSize(c.details.student_name, w - 48);
 while (nameLines.length > 2 && nameSize > 5) {
  doc.setFontSize(--nameSize); nameLines = doc.splitTextToSize(c.details.student_name, w - 48);
 }
 doc.text(nameLines, w / 2, nameLines.length > 1 ? 116 : 121, { align: 'center', lineHeightFactor: 1.15 });
 centered(`Student ID: ${c.details.student_number}`, 130, 10, 'helvetica', 'normal', muted);
 centered('has fully cleared all recorded sanction hours during the authorized clearing period.', 143, 12, 'times');
 centered(c.details.period_title, 150, 11, 'helvetica', 'bold');
 centered(`${formatManilaDate(c.details.starts_at)} – ${formatManilaDate(c.details.ends_at)}  |  Cleared: ${formatManilaDate(c.cleared_at)}`, 157, 9, 'helvetica', 'normal', muted);
 doc.setTextColor(navy).setFont('helvetica', 'bold').setFontSize(8);
 doc.text('ISSUED', 24, 169);
 doc.setFont('helvetica', 'normal').setFontSize(9).text(formatManilaDate(c.issued_at, { month: 'long', day: 'numeric', year: 'numeric' }), 24, 176);
 doc.setFontSize(7).setTextColor(muted).text(doc.splitTextToSize(`Reference: ${c.reference}`, 78), 24, 183);
 const authority = c.details.authorized_by || 'Authorized OSSA reviewer';
 doc.setDrawColor(gold).line(112, 169, 204, 169);
 doc.setTextColor(navy).setFont('helvetica', 'bold').setFontSize(9);
 while (doc.getTextWidth(authority) > 90) doc.setFontSize(doc.getFontSize() - 0.5);
 doc.text(authority, 158, 176, { align: 'center' });
 doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(muted).text('Release authorized by OSSA • System-issued certificate', 158, 182, { align: 'center' });
 // White quiet zone protects QR scanning, including when printed on cream paper.
 doc.setFillColor('#FFFFFF').rect(242, 160, 30, 30, 'F');
 doc.addImage(qrPng, 'PNG', 245, 163, 24, 24);
 doc.link(242, 160, 30, 30, { url: verificationUrl });
 doc.setFontSize(6.5).text('SCAN TO VERIFY', 257, 193, { align: 'center' });
 doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(muted);
 doc.text(doc.splitTextToSize('Verifies sanction clearance only. Verify online for current validity; other school requirements are assessed separately.', 205), 24, 191);
 return doc;
}

export async function prepareClearanceCertificatePdf(c: ClearanceCertificate, svg: SVGSVGElement, url: string) {
 const source = new XMLSerializer().serializeToString(svg);
 const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
 try {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not prepare the verification QR.')); image.src = blobUrl; });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 768;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the certificate.');
  context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, 768, 768); context.drawImage(image, 32, 32, 704, 704);
  const [response, fontResponse] = await Promise.all([
   fetch(`${import.meta.env.BASE_URL}academic-seal-transparent.png`),
   fetch(`${import.meta.env.BASE_URL}fonts/UnifrakturMaguntia-Book.ttf`),
  ]);
  if (!response.ok) throw new Error('Could not load the school seal. Please retry.');
  if (!fontResponse.ok) throw new Error('Could not load the certificate font. Please retry.');
  return createClearanceCertificatePdf(c, canvas.toDataURL('image/png'), url, new Uint8Array(await response.arrayBuffer()), new Uint8Array(await fontResponse.arrayBuffer()));
 } finally { URL.revokeObjectURL(blobUrl); }
}

export async function downloadClearanceCertificate(c: ClearanceCertificate, svg: SVGSVGElement, url: string) {
 const doc = await prepareClearanceCertificatePdf(c, svg, url);
 await doc.save(`${c.reference}.pdf`, { returnPromise: true });
}
