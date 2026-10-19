import type { jsPDF } from 'jspdf';

/** A transparent seal with a gold ring; keep the full ribbon inside the border. */
export function drawPdfSchoolSeal(doc: jsPDF, logo: Uint8Array, x: number, y: number, size: number) {
  doc.saveGraphicsState();
  doc.setDrawColor(212, 175, 55).setLineWidth(0.35);
  doc.circle(x + size / 2, y + size / 2, size * 0.58, 'S');
  const format = logo[0] === 0x89 && logo[1] === 0x50 ? 'PNG' : 'JPEG';
  doc.addImage(logo, format, x, y, size, size, 'school-seal', 'FAST');
  doc.restoreGraphicsState();
}
