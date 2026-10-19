import { useState } from 'react';
import { Award, CalendarCheck, CheckCircle2, HeartHandshake, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SanctionClearanceProps {
  uid: string;
  name: string;
  clearanceId: string;
}

export default function SanctionClearance({ uid, name, clearanceId }: SanctionClearanceProps) {
  const storageKey = `rmc:sanction-clearance:${uid}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== clearanceId;
    } catch {
      return true;
    }
  });

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, clearanceId);
    } catch {
      // The celebration still dismisses when browser storage is unavailable.
    }
  };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30 sm:flex-row sm:items-center sm:justify-between" aria-label="Sanction clearance">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" size={26} />
          <div>
            <h2 className="font-bold text-emerald-900 dark:text-emerald-200">All sanctions cleared!</h2>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">You have no remaining sanction hours. Keep moving forward, one good choice at a time.</p>
          </div>
        </div>
        <Button variant="secondary" fullWidth={false} className="shrink-0" onClick={() => setOpen(true)}>
          <Sparkles size={16} aria-hidden="true" /> View celebration
        </Button>
      </section>

      <Modal open={open} onClose={dismiss} title="Congratulations!" size="md" bodyClassName="p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-gold-50 px-6 py-10 text-center dark:from-emerald-950 dark:via-slate-900 dark:to-slate-800 sm:px-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <Sparkles className="absolute left-6 top-8 text-gold-500" size={28} />
            <Sparkles className="absolute right-8 top-16 text-emerald-500" size={20} />
            <span className="absolute bottom-20 left-10 h-3 w-3 rotate-12 rounded-sm bg-emerald-300 dark:bg-emerald-700" />
            <span className="absolute right-10 top-8 h-2 w-2 rounded-full bg-gold-400" />
          </div>
          <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-8 border-emerald-100 bg-emerald-600 text-white shadow-lg dark:border-emerald-900">
            <Award size={46} aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">A fresh start</p>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-brand-900 dark:text-white">All sanctions cleared!</h3>
          <p className="mt-4 break-words text-lg font-semibold text-slate-800 dark:text-slate-100">Well done{name ? `, ${name}` : ''}!</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Your sanction balance is now zero. Thank you for taking responsibility and completing your clearance. Keep showing up and making a positive difference.</p>
          <div className="my-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-5 py-2 text-sm font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            <CheckCircle2 size={18} aria-hidden="true" /> 0 hours remaining
          </div>
          <div className="mb-6 rounded-2xl border border-gold-200 bg-gold-50 p-5 dark:border-gold-800 dark:bg-gold-900/20">
            <Sparkles size={20} aria-hidden="true" className="mx-auto mb-2 text-gold-600 dark:text-gold-400" />
            <p className="text-base font-semibold leading-relaxed text-brand-900 dark:text-gold-100">Every positive choice is a step toward the person you want to become.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Take a moment to appreciate your progress. You can learn, grow, and build better habits from here. Small steps count, and you can keep taking them.</p>
          </div>
          <section aria-label="Ways to keep moving forward" className="mb-7 text-left">
            <h4 className="mb-3 text-sm font-bold text-brand-900 dark:text-white">Keep the momentum going</h4>
            <ul className="space-y-3">
              {[
                { icon: CalendarCheck, title: 'Show up for your goals', description: 'Check upcoming activities and plan ahead so you can arrive on time.' },
                { icon: TrendingUp, title: 'Choose progress every day', description: 'Build one habit at a time. If you slip up, reflect, ask for help, and try again.' },
                { icon: HeartHandshake, title: 'Make a positive difference', description: 'Support your classmates and take part in opportunities to serve your community.' },
              ].map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-3 rounded-xl bg-white/70 p-3 dark:bg-slate-800/70">
                  <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <Button size="lg" onClick={dismiss}>Continue to my records</Button>
        </div>
      </Modal>
    </>
  );
}
