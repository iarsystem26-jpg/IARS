import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InstitutionBranding, paletteVariables, themeColors } from '../../lib/institutionBranding';
import Button from '../ui/Button';
import QRCode from 'react-qr-code';

/** A separate document keeps the admin's dark mode and draft colors out of the preview. */
export default function InstitutionPreview({ branding, mode }: { branding: InstitutionBranding; mode: 'light' | 'dark' }) {
  const [view, setView] = useState('Dashboard');
  const [qrVersion, setQrVersion] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const colors = themeColors(branding);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !body) return;
    doc.documentElement.classList.toggle('dark', mode === 'dark');
    doc.documentElement.classList.add('institution-branded');
    for (const [key, value] of Object.entries(paletteVariables(colors.primaryColor, colors.accentColor))) doc.documentElement.style.setProperty(key, value);
  }, [body, mode, colors.primaryColor, colors.accentColor]);
  const initialize = () => {
    const doc = frame.current?.contentDocument; if (!doc) return;
    doc.head.querySelectorAll('[data-preview-style]').forEach(element => element.remove());
    document.querySelectorAll('style,link[rel="stylesheet"]').forEach(element => {
      const clone = element.cloneNode(true) as HTMLElement; clone.setAttribute('data-preview-style', ''); doc.head.appendChild(clone);
    });
    setBody(doc.body);
  };
  return <div className="overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-600">
    <iframe ref={frame} title={`${mode === 'dark' ? 'Dark' : 'Light'} institution dashboard preview`} sandbox="allow-same-origin" className="h-[520px] w-full border-0" onLoad={initialize}
      srcDoc={'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'} />
    {body && createPortal(<div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="flex min-h-[520px]">
        <aside className="w-28 shrink-0 bg-brand-900 p-3 text-white sm:w-36">
          <div className="mb-6 rounded-xl bg-white p-2"><img src={branding.logoUrl || '/iars-icon.png'} alt="Institution logo" className="mx-auto h-12 w-12 object-contain" /></div>
          <p className="break-words text-sm font-bold">{branding.shortName || 'Your school'}</p>
          <nav aria-label="Preview navigation" className="mt-5 space-y-2 text-xs">{['Dashboard', 'Attendance', 'Events', 'My records'].map(item => <button key={item} type="button" aria-current={view === item ? 'page' : undefined} className={`block min-h-10 w-full rounded-lg p-2 text-left hover:bg-white/10 ${view === item ? 'bg-white/15' : ''}`} onClick={() => setView(item)}>{item}</button>)}</nav>
        </aside>
        <main className="min-w-0 flex-1 space-y-4 p-4">
          <header className="flex items-center gap-2"><img src={branding.logoUrl || '/iars-icon.png'} alt="" className="h-8 w-8 rounded-md bg-white object-contain" /><p className="truncate text-xs font-bold">{branding.name || 'Your institution'}</p></header>
          <div><p className="text-xs text-slate-500 dark:text-slate-400">Student workspace</p><h2 className="text-xl font-bold text-brand-900 dark:text-white">{view === 'Dashboard' ? 'Your dashboard' : view === 'QR' ? 'Your student QR' : view}</h2></div>
          {view === 'Dashboard' && <><section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-300">Attendance rate</p><strong className="text-2xl text-brand-700 dark:text-brand-200">98%</strong><div className="mt-2 h-2 rounded bg-brand-100"><div className="h-2 w-4/5 rounded bg-brand-500" /></div></section>
          <div className="flex flex-wrap gap-2"><Button fullWidth={false} size="sm" onClick={() => setView('My records')}>View records</Button><Button fullWidth={false} variant="gold" size="sm" onClick={() => setView('QR')}>Show QR</Button></div></>}
          {view === 'QR' && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"><div className="mx-auto w-fit max-w-full rounded-xl bg-white p-3"><QRCode value={`IARS-PREVIEW-ONLY:${branding.name || 'institution'}:sample-student:${qrVersion}`} size={148} style={{ maxWidth: '100%', height: 'auto' }} /></div><p className="text-center text-sm font-bold">Alex Student</p><p className="text-center text-xs text-slate-500 dark:text-slate-300">Sample QR - not valid for attendance</p><div className="flex flex-wrap justify-center gap-2"><Button fullWidth={false} size="sm" variant="secondary" onClick={() => setQrVersion(value => value + 1)}>Refresh QR</Button><Button fullWidth={false} size="sm" onClick={() => setView('Dashboard')}>Back to dashboard</Button></div></section>}
          {(view === 'My records' || view === 'Attendance') && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><h3 className="text-sm font-bold">Recent attendance</h3>{[['Orientation', 'Present'], ['Student assembly', 'Present'], ['Campus activity', 'Late']].map(([event, status]) => <div key={event} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-2 text-xs dark:border-slate-700"><span>{event}</span><span className="font-semibold text-brand-700 dark:text-brand-200">{status}</span></div>)}<Button fullWidth={false} size="sm" onClick={() => setView('QR')}>Show QR</Button></section>}
          {view === 'Events' && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><h3 className="text-sm font-bold">Upcoming events</h3><p className="text-sm">Student assembly</p><p className="text-xs text-slate-500 dark:text-slate-300">Sample event - Main auditorium</p><Button fullWidth={false} size="sm" onClick={() => setView('QR')}>Show event QR</Button></section>}
          <p className="text-xs text-slate-500 dark:text-slate-400">Preview only · Example records</p>
        </main>
      </div>
    </div>, body)}
  </div>;
}
