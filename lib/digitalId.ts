import type { UserProfile } from '../types';
import { formatManilaDate } from './dateTime';

const NAVY = '#0E1B42';
const INK = '#14213D';
const MUTED = '#64748B';
const GOLD = '#D4AF37';

export function getDigitalIdRole(role: string): string {
  return ({ mayor: 'Student · Section Mayor', ssg: 'SSG Officer', ossa: 'OSAS Officer',
    ossa_staff: 'OSAS Officer', admin: 'System Administrator' } as Record<string, string>)[role] || 'Student';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => reject(new Error('Card image took too long to load')), 5000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Card image could not be rendered')); };
    image.src = src;
  });
}

/** Draw the printed ID independently of the rotating live QR and screen theme. */
export async function renderDigitalId(profile: UserProfile, schoolName: string, qrSvg: SVGElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const [qrImage, seal] = await Promise.all([
    loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(qrSvg))),
    loadImage(`${import.meta.env.BASE_URL}academic-seal-transparent.png`).catch(() => null),
  ]);

  const rounded = (x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  // Wrap at word boundaries; split a word only when it cannot fit on a line by itself.
  const wrap = (value: string, width: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of value.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    // Avoid a short orphan such as "Campus" when the previous line can share a word.
    if (lines.length > 1) {
      const last = lines.length - 1;
      const words = lines[last - 1].split(' ');
      if (words.length > 1 && ctx.measureText(lines[last]).width < ctx.measureText(lines[last - 1]).width * 0.4) {
        const candidate = `${words[words.length - 1]} ${lines[last]}`;
        if (ctx.measureText(candidate).width <= width) {
          lines[last] = candidate;
          lines[last - 1] = words.slice(0, -1).join(' ');
        }
      }
    }
    return lines;
  };
  const textBlock = (value: string, x: number, y: number, width: number, height: number, maxSize: number,
    weight: number, color: string, align: CanvasTextAlign = 'left', maxLines = 2) => {
    let size = maxSize;
    let lines: string[];
    do {
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      lines = wrap(value, width);
      if (lines.length <= maxLines && lines.length * size * 1.25 <= height) break;
      size -= 1;
    } while (size > 8);
    // Bound even pathological profile values to the allotted space.
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    lines = wrap(value, width).slice(0, Math.min(maxLines, Math.floor(height / (size * 1.25))));
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const lineHeight = size * 1.25;
    const startY = y + (height - lines.length * lineHeight) / 2 + lineHeight / 2;
    lines.forEach((line, index) => ctx.fillText(line, align === 'center' ? x + width / 2 : x, startY + index * lineHeight, width));
  };

  ctx.fillStyle = '#EEF2F7';
  ctx.fillRect(0, 0, 900, 1280);
  rounded(36, 36, 828, 1208, 28, '#FFFFFF', '#DCE4EF');

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(36, 36, 828, 220, [28, 28, 0, 0]);
  ctx.clip();
  ctx.fillStyle = NAVY;
  ctx.fillRect(36, 36, 828, 220);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let x = -180; x < 900; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 36); ctx.lineTo(x + 220, 256); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = GOLD;
  ctx.fillRect(36, 256, 828, 5);

  ctx.beginPath();
  ctx.arc(138, 142, 60, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (seal) {
    ctx.save();
    ctx.beginPath(); ctx.arc(138, 142, 56, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(seal, 82, 86, 112, 112);
    ctx.restore();
  } else {
    textBlock('IARS', 82, 86, 112, 112, 25, 700, GOLD, 'center', 1);
  }
  textBlock('DIGITAL ACCESS CARD', 226, 69, 588, 24, 14, 700, '#E8CC6A', 'left', 1);
  textBlock(schoolName, 226, 103, 588, 99, 28, 700, '#FFFFFF', 'left', 3);
  textBlock('IARS · Attendance & event check-in', 226, 210, 588, 23, 15, 400, '#CBD5E1', 'left', 1);

  textBlock(profile.name.toUpperCase(), 88, 295, 724, 80, 34, 700, INK, 'center');
  textBlock(`Student ID  ${profile.student_id}`, 88, 389, 724, 28, 20, 600, MUTED, 'center', 1);
  const role = getDigitalIdRole(profile.role);
  ctx.font = '600 16px Arial, sans-serif';
  const roleWidth = Math.min(724, Math.max(140, ctx.measureText(role).width + 40));
  rounded(450 - roleWidth / 2, 433, roleWidth, 36, 18, '#EFF4FF');
  textBlock(role, 450 - roleWidth / 2 + 16, 433, roleWidth - 32, 36, 16, 600, '#2455A6', 'center', 1);

  const school = profile.school_data;
  const department = school.department || school.program || school.track || school.strand || 'General studies';
  const assignment = [school.level, school.section].filter(Boolean).join(' · ') || 'Not assigned';
  const field = (label: string, value: string, x: number) => {
    rounded(x, 497, 350, 112, 16, '#F7F9FC', '#E2E8F0');
    textBlock(label, x + 22, 514, 306, 22, 14, 600, MUTED, 'left', 1);
    textBlock(value, x + 22, 543, 306, 49, 20, 700, INK);
  };
  field('PROGRAM / DEPARTMENT', department, 88);
  field('YEAR & SECTION', assignment, 462);

  // An unpatterned white quiet zone keeps the printed QR easy to scan.
  rounded(238, 637, 424, 424, 20, '#FFFFFF', '#E2E8F0');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImage, 270, 669, 360, 360);
  textBlock('Scan for attendance check-in', 88, 1079, 724, 30, 23, 700, INK, 'center', 1);
  textBlock('Printed QR · Valid until replaced', 88, 1115, 724, 24, 17, 600, '#047857', 'center', 1);

  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(88, 1160, 724, 1);
  textBlock('For attendance only. Not valid for financial or academic transactions.', 88, 1173, 724, 23, 15, 400, MUTED, 'center', 1);
  textBlock('Lost your card? Replace the printed QR, then download a new ID.', 88, 1200, 724, 23, 15, 400, MUTED, 'center', 1);
  textBlock(`Issued ${formatManilaDate(Date.now(), { month: 'short', day: 'numeric', year: 'numeric' })} · IARS`, 88, 1252, 724, 20, 12, 400, MUTED, 'center', 1);
  return canvas;
}
