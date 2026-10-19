import React, { useEffect, useRef, useState } from 'react';
import ErrorNotice from './ui/ErrorNotice';
import { loadLegalPage } from '../lib/legalPageStore';
import { LegalContent } from '../lib/legalPages';

export default function EnrollmentPrivacyAgreement({ accepted, onChange }: {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}) {
  const [page, setPage] = useState<LegalContent | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setError(false);
    loadLegalPage('agreement').then(value => { if (active) setPage(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  const updateProgress = () => {
    const element = panel.current;
    if (!element || element.clientHeight <= 0) return;
    const distance = element.scrollHeight - element.clientHeight;
    const percent = distance <= 1 || element.scrollTop >= distance - 1
      ? 100 : Math.min(99, Math.floor(Math.max(0, element.scrollTop) / distance * 100));
    setProgress(current => Math.max(current, percent));
  };

  useEffect(() => {
    if (!page) return;
    updateProgress();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateProgress) : null;
    if (panel.current) observer?.observe(panel.current);
    return () => observer?.disconnect();
  }, [page]);

  return <div className="space-y-4">
    <h2 className="text-lg font-bold text-brand-900 dark:text-white">Data privacy agreement</h2>
    <p id="privacy-reading-instructions" className="text-sm text-slate-600 dark:text-slate-300">Read the agreement below from top to bottom. Scroll inside the panel to unlock the agreement checkbox, then agree before entering your enrollment details.</p>
    {error ? <ErrorNotice error="Unable to load the agreement. Please retry before continuing." operation="Load privacy agreement">
      <button type="button" className="font-bold underline" onClick={() => setAttempt(current => current + 1)}>Retry loading agreement</button>
    </ErrorNotice> : !page ? <p role="status" className="text-sm">Loading data privacy agreement...</p> : <>
      <div className="flex justify-between gap-3 text-sm font-semibold"><span>Reading progress</span><span>{progress}%</span></div>
      <div role="progressbar" aria-label="Agreement reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div ref={panel} role="region" aria-label="Data privacy agreement text" aria-describedby="privacy-reading-instructions" tabIndex={0} onScroll={updateProgress} className="h-80 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50 p-5 focus-visible:outline-gold-500 dark:border-slate-700 dark:bg-slate-800 sm:h-96">
        <article className="space-y-6 text-sm leading-7">
          <div><h3 className="text-lg font-bold">{page.title}</h3><p className="mt-2">{page.summary}</p></div>
          {page.sections.map((section, index) => <section key={index} className="space-y-3">
            <h3 className="font-bold">{section.heading}</h3>
            {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            {section.items && <ul className="list-disc space-y-3 pl-5">{section.items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
          </section>)}
          <p className="border-t border-slate-200 pt-4 font-semibold dark:border-slate-700">End of agreement</p>
        </article>
      </div>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{progress === 100 ? 'You have reached the end. You may now agree to continue.' : 'Scroll to the bottom of the agreement to continue.'}</p>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold dark:border-slate-700">
        <input type="checkbox" checked={accepted} disabled={progress < 100} onChange={event => onChange(progress === 100 && event.target.checked)} className="mt-1 h-4 w-4 accent-gold-500" />
        <span>I have read and agree to the Data Privacy Agreement.</span>
      </label>
    </>}
  </div>;
}
