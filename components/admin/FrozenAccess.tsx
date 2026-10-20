import { educationalUnit } from '../../lib/educationalUnit';
import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck, RefreshCw, LogOut, Building2, Clock3, UserRound, ExternalLink } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import { appAuth, refreshData } from '../../lib/backend';
import { getFreezeDetails } from '../../lib/freeze';
import { formatManilaDateTime } from '../../lib/dateTime';
import { toast } from '../../lib/toast';
import { legalLinks } from '../../lib/legal';

export default function FrozenAccess() {
  const { profile } = useAuth();
  const freeze = getFreezeDetails(profile);
  const [pending, setPending] = useState<'refresh' | 'logout' | null>(null);
  const [checked, setChecked] = useState(false);
  const act = async (action: 'refresh' | 'logout') => {
    setPending(action);
    try {
      if (action === 'refresh') { await refreshData(); setChecked(true); }
      else await appAuth.signOut();
    } catch (error) { toast.error(error); }
    finally { setPending(null); }
  };

  return <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_#e7eef8_0%,_#f8fafc_55%)] text-slate-900 dark:bg-[radial-gradient(ellipse_at_top,_#142643_0%,_#080f1d_60%)] dark:text-slate-100">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
      <div className="flex min-w-0 items-center gap-3">
        <img src={educationalUnit.logoUrl} alt="IARS logo" className="h-12 w-12 shrink-0 object-contain" />
        <div className="min-w-0"><p className="text-base font-extrabold tracking-wide text-brand-900 dark:text-white">IARS</p><p className="max-w-48 text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">Institution Attendance &amp; Records System</p></div>
      </div>
      <ThemeToggle className="min-h-11 min-w-11" />
    </header>
    <section aria-labelledby="frozen-access-title" className="flex flex-1 items-center justify-center px-4 pb-8 pt-3 sm:px-6 sm:pb-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center sm:mb-7">
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/80 bg-white/80 text-brand-900 shadow-lg shadow-brand-900/5 dark:border-slate-700 dark:bg-slate-800 dark:text-gold-300">
            <LockKeyhole size={32} strokeWidth={1.6} aria-hidden="true" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-slate-50 bg-gold-400 dark:border-slate-950" aria-hidden="true"><span className="h-1.5 w-1.5 rounded-full bg-brand-900" /></span>
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Temporary access restriction</p>
          <h1 id="frozen-access-title" className="text-[1.75rem] font-bold leading-tight tracking-tight sm:text-3xl">Your workspace is paused</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">{freeze?.account ? 'School administration has temporarily paused access for your account.' : freeze?.global ? 'School administration has temporarily paused access for the school.' : 'School administration has temporarily paused access for your department or class.'}</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-brand-900/5 dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-none">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-7 dark:border-slate-800">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-900 dark:bg-slate-800 dark:text-gold-300"><UserRound size={20} aria-hidden="true" /></div>
            <div className="min-w-0"><p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Signed in as</p><p className="mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-white">{profile?.name || 'Signed-in account'}</p></div>
          </div>
          <div className="border-b border-slate-100 px-5 py-5 sm:px-7 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xs font-bold text-slate-500 dark:text-slate-400">Notice from administration</h2><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> Access paused</span></div>
            <p className="whitespace-pre-line break-words text-sm font-medium leading-6 text-slate-800 dark:text-slate-200">{freeze?.reason || 'Access has been temporarily paused by school administration.'}</p>
          </div>
          <dl className="grid gap-4 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 sm:px-7 dark:bg-slate-800/30">
            <div><dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"><Building2 size={13} aria-hidden="true" /> Affected unit</dt><dd className="mt-1.5 break-words text-xs font-semibold leading-5">{freeze?.scope || 'Your assigned department or class'}</dd></div>
            <div><dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"><Clock3 size={13} aria-hidden="true" /> Paused since</dt><dd className="mt-1.5 text-xs font-semibold leading-5">{freeze?.frozenAt ? formatManilaDateTime(freeze.frozenAt) : 'Set by school administration'}</dd></div>
          </dl>
          <div className="px-5 py-5 sm:px-7">
            <div className="flex items-start gap-2.5"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><p className="text-xs leading-5 text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-700 dark:text-slate-200">Your records are safe.</span> Attendance and student records are preserved during this pause.</p></div>
            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">For help, contact your school administration or department office and mention the affected unit above.</p>
            <div className="mt-5 flex flex-col gap-2.5 min-[400px]:flex-row">
              <button type="button" disabled={Boolean(pending)} onClick={() => void act('refresh')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-3 text-xs font-bold text-white transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900 disabled:opacity-60 dark:bg-gold-400 dark:text-brand-950 dark:hover:bg-gold-300"><RefreshCw size={15} className={pending === 'refresh' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />{pending === 'refresh' ? 'Checking access…' : 'Check access again'}</button>
              <button type="button" disabled={Boolean(pending)} onClick={() => void act('logout')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><LogOut size={15} aria-hidden="true" />{pending === 'logout' ? 'Signing out…' : 'Sign out'}</button>
            </div>
          </div>
        </div>
        <p role="status" className="mx-auto mt-5 max-w-sm text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">{checked ? 'Access is still paused. Contact school administration for an update.' : 'Access will return automatically when administration lifts the pause.'}</p>
        <section aria-labelledby="frozen-legal-title" className="mt-6 border-t border-slate-200/70 pt-5 dark:border-slate-800">
          <h2 id="frozen-legal-title" className="mb-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Legal documents</h2>
          <div className="grid grid-cols-2 gap-2">
            {legalLinks.map(link => <a key={link.path} href={`#${link.path}`} target="_blank" rel="noopener noreferrer" title="Opens in a new tab" className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-xs font-semibold leading-5 text-slate-600 transition hover:border-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"><span className="min-w-0 break-words">{link.title}</span><ExternalLink size={13} className="shrink-0 text-slate-400" aria-hidden="true" /></a>)}
          </div>
        </section>
      </div>
    </section>
    <footer className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[10px] font-medium tracking-wide text-slate-400 dark:text-slate-500">Institution Attendance &amp; Records System</footer>
  </div>;
}
