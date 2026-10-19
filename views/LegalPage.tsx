import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Pencil } from 'lucide-react';
import PublicHeader from '../components/ui/PublicHeader';
import PublicFooter from '../components/ui/PublicFooter';
import { legalLinks } from '../lib/legal';

import { useAuth } from '../components/AuthContext';
import { defaultLegalPages, LegalKind, LegalContent } from '../lib/legalPages';
import { loadLegalPage, saveLegalPage, SavedLegalPage } from '../lib/legalPageStore';
import LegalPageEditor from '../components/admin/LegalPageEditor';

const LegalPage: React.FC<{ kind: LegalKind; adminPreview?: boolean }> = ({ kind, adminPreview = false }) => {
  const { profile } = useAuth();
  const [saved, setSaved] = useState<SavedLegalPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const page = saved || defaultLegalPages[kind];
  const isAdmin = adminPreview && profile?.role === 'admin';
  const ContentContainer = adminPreview ? 'div' : 'main';
  useEffect(() => {
    let active = true;
    setSaved(null); setEditing(false); setLoading(true); setError(''); setNotice('');
    loadLegalPage(kind).then(value => { if (active) setSaved(value); })
      .catch(() => { if (active) setError('Unable to load the saved page. Showing the original content. Reload to try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);
  const handleSave = async (draft: LegalContent) => {
    if (!saved || !isAdmin) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const value = await saveLegalPage(kind, draft, saved.updated_at);
      setSaved(value); setEditing(false); setNotice('Saved. This is now the current public page.');
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSaving(false); }
  };
  useEffect(() => {
    window.scrollTo(0, 0);
    const previousTitle = document.title;
    document.title = `${page.title} | IARS`;
    return () => { document.title = previousTitle; };
  }, [page.title]);
  return <div className={adminPreview ? 'text-slate-800 dark:text-slate-200' : 'min-h-dvh bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200'}>
    {!adminPreview && <PublicHeader />}
    <ContentContainer id={adminPreview ? undefined : 'main-content'} className={adminPreview ? 'mx-auto max-w-4xl py-6' : 'mx-auto max-w-4xl px-6 pb-12 pt-32 sm:pb-16 sm:pt-36'}>
      {!adminPreview && <Link to="/" className="mb-8 inline-flex items-center gap-2 py-2 text-sm font-semibold text-brand-900 hover:underline dark:text-white"><ArrowLeft size={18} /> Back to home</Link>}
      {isAdmin && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div><p className="font-bold">{editing ? 'Edit legal page' : 'Current saved page'}</p><p className="text-sm text-slate-600 dark:text-slate-300">{editing ? 'Save changes to update the public page.' : 'Preview the page your visitors see.'}</p></div>
        {!editing && <button type="button" disabled={loading || !saved} onClick={() => { setNotice(''); setEditing(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-900 px-4 py-2 font-semibold text-white disabled:opacity-50"><Pencil size={16} /> Edit page</button>}
      </div>}
      {loading && <p role="status" className="mb-4 text-sm">Loading saved page...</p>}
      {error && <ErrorNotice error={error} operation="Legal Page"></ErrorNotice>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
      {editing && isAdmin ? <LegalPageEditor key={kind} content={page} saving={saving} onSave={handleSave} onCancel={() => { setEditing(false); setError(''); }} /> : <>
      <div className="mb-10 space-y-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><ShieldCheck size={20} /> Your information & your rights</p>
        <h1 className="text-3xl font-black tracking-tight text-brand-900 dark:text-white sm:text-4xl">{page.title}</h1>
        <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-300">{page.summary}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Last updated: {saved ? new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(saved.updated_at)) : 'October 8, 2026'}</p>
      </div>
      <nav aria-label="On this page" className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-bold">On this page</p>
        <ol className="grid list-inside list-decimal gap-2 text-sm sm:grid-cols-2">
          {page.sections.map((section, i) => <li key={i}><a href={`#legal-section-${i}`} onClick={event => { event.preventDefault(); document.getElementById(`legal-section-${i}`)?.scrollIntoView({ behavior: 'smooth' }); }} className="underline underline-offset-4">{section.heading}</a></li>)}
        </ol>
      </nav>
      <article className="space-y-9">
        {page.sections.map((section, i) => <section key={i} id={`legal-section-${i}`} className="scroll-mt-28 space-y-3">
          <h2 className="text-xl font-bold text-brand-900 dark:text-white">{section.heading}</h2>
          {section.paragraphs?.map(paragraph => <p key={paragraph} className="text-base leading-7">{paragraph}</p>)}
          {section.items && <ul className="list-disc space-y-3 pl-5 text-base leading-7">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>)}
      </article>
      </>}
      <aside className="mt-10 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold">Official Philippine privacy guidance</h2>
        <ul className="space-y-2">
          <li><a href="https://privacy.gov.ph/data-privacy-act-/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Data Privacy Act of 2012 (Republic Act No. 10173)</a></li>
          <li><a href="https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Implementing Rules and Regulations</a></li>
          <li><a href="https://privacy.gov.ph/data-subject-rights/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Your privacy rights</a></li>
          <li><a href="https://privacy.gov.ph/filing-a-complaint/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">How to file a privacy complaint</a></li>
        </ul>
      </aside>
      <nav aria-label="Related legal pages" className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm">
        {legalLinks.map((link, index) => ({ ...link, kind: (['privacy', 'deletion', 'agreement', 'terms'] as const)[index] })).filter(link => link.kind !== kind).map(link => <Link key={link.path} to={adminPreview ? `/admin/controls?tab=legal&page=${link.kind}` : link.path} className="font-semibold underline underline-offset-4">{link.title}</Link>)}
      </nav>
    </ContentContainer>
    {!adminPreview && <PublicFooter />}
  </div>;
};

export default LegalPage;
