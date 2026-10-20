import { educationalUnit } from '../../lib/educationalUnit';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Download, FileText } from 'lucide-react';
import Button from '../ui/Button';
import { calendarICS, type CalendarItem, type CalendarClosure } from '../../lib/personalCalendar';
import { useAuth } from '../AuthContext';
import { appData } from '../../lib/backend';
import { findNodePath, getProfileSchoolName } from '../../lib/academicDirectory';
import { errorMessage } from '../../lib/errors';

export default function CalendarExport({ month, items, closures, filter, disabled }: {
 month: string; items: CalendarItem[]; closures: CalendarClosure[]; filter: string; disabled: boolean;
}) {
 const { profile } = useAuth();
 const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const container = useRef<HTMLDivElement>(null);
 useEffect(() => {
  if (!open) return;
  const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); container.current?.querySelector<HTMLButtonElement>('button')?.focus(); } };
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
  return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
 }, [open]);
 const exportFile = async (format: 'pdf' | 'ics') => {
  setBusy(true); setError('');
  try {
   if (format === 'pdf') {
    const { createCalendarPdf } = await import('../../lib/calendarPdf');
    const nodes = appData.getSchoolStructure();
    const assignment = profile?.official_data?.assignment_node_id || profile?.school_data?.academic_assignment?.terminalGroupId;
    const path = assignment ? findNodePath(nodes, assignment) || [] : [];
    const unitName = path.at(-1)?.name || getProfileSchoolName(profile, nodes);
    const logoUrl = [...path].reverse().find(node => node.logo_url)?.logo_url;
    const loadLogo = async (url: string) => {
     const response = await fetch(url); if (!response.ok) throw new Error('Logo unavailable');
     const bitmap = await createImageBitmap(await response.blob());
     try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Logo unavailable');
      context.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Logo unavailable')), 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
     } finally { bitmap.close(); }
    };
    const fallbackUrl = educationalUnit.logoUrl;
    const logo = await loadLogo(logoUrl || fallbackUrl).catch(() => loadLogo(fallbackUrl));
    createCalendarPdf(month, items, closures, filter, Date.now(), { unitName: unitName === 'School / branch not assigned' ? 'School-wide calendar' : unitName, logo }).save(`IARS-calendar-${month}.pdf`);
   } else {
    const url = URL.createObjectURL(new Blob([calendarICS(items)], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `IARS-calendar-${month}.ics`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
   }
   setOpen(false);
  } catch (error) { setError(errorMessage(error)); }
  finally { setBusy(false); }
 };
 return <div ref={container} className="relative w-full sm:w-auto">
  <Button variant="gold" fullWidth={false} className="w-full sm:w-auto" aria-expanded={open} aria-controls="calendar-export-options" disabled={disabled || busy} onClick={() => setOpen(value => !value)}><Download size={16}/>{busy ? 'Exporting...' : 'Export calendar'}<ChevronDown size={16}/></Button>
  {open && <div id="calendar-export-options" className="absolute right-0 z-30 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-80" aria-label="Calendar export formats">
   <button type="button" disabled={busy} onClick={() => void exportFile('pdf')} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-slate-800"><FileText size={20} className="mt-0.5 shrink-0 text-brand-500 dark:text-brand-300"/><span><span className="block text-sm font-semibold">Download PDF</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Monthly calendar and detailed agenda for printing or sharing.</span></span></button>
   <button type="button" disabled={busy || !items.some(item => !item.suspended && !item.cancelled)} onClick={() => void exportFile('ics')} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 dark:hover:bg-slate-800"><CalendarDays size={20} className="mt-0.5 shrink-0 text-brand-500 dark:text-brand-300"/><span><span className="block text-sm font-semibold">Download ICS (iCalendar)</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Import this schedule into Google Calendar, Outlook, or Apple Calendar.</span></span></button>
   {error && <ErrorNotice error={error} operation="Calendar Export"></ErrorNotice>}
  </div>}
 </div>;
}
