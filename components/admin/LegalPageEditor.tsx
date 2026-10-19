import { useState } from 'react';
import { LegalContent, Section } from '../../lib/legalPages';

type Props = { content: LegalContent; saving: boolean; onSave: (content: LegalContent) => Promise<void>; onCancel: () => void };
const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
const button = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700';

export default function LegalPageEditor({ content, saving, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<LegalContent>(() => structuredClone(content));
  const [validation, setValidation] = useState('');
  const updateSection = (index: number, changes: Partial<Section>) => {
    setDraft(value => ({ ...value, sections: value.sections.map((section, i) => i === index ? { ...section, ...changes } : section) }));
  };
  return <form onSubmit={event => {
    event.preventDefault();
    const cleaned = { title: draft.title.trim(), summary: draft.summary.trim(), sections: draft.sections.map(section => ({
      heading: section.heading.trim(),
      paragraphs: section.paragraphs?.map(text => text.trim()).filter(Boolean),
      items: section.items?.map(text => text.trim()).filter(Boolean),
    })) };
    if (!cleaned.summary || cleaned.sections.some(section => !section.paragraphs?.length && !section.items?.length)) {
      setValidation('Enter a summary and at least one paragraph or bullet point in every section.'); return;
    }
    if (new TextEncoder().encode(JSON.stringify(cleaned.sections)).length > 200000 || cleaned.sections.some(section => [...(section.paragraphs || []), ...(section.items || [])].some(text => text.length > 20000))) {
      setValidation('The page is too long. Keep each paragraph or bullet point within 20,000 characters and the page within 200 KB.'); return;
    }
    setValidation('');
    void onSave(cleaned);
  }} className="space-y-6">
    {validation && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{validation}</p>}
    <fieldset disabled={saving} className="min-w-0 space-y-6">
      <label className="block font-semibold">Page title<input required maxLength={200} pattern=".*\S.*" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className={field} /></label>
      <label className="block font-semibold">Summary<textarea required maxLength={2000} rows={3} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} className={field} /></label>
      {draft.sections.map((section, index) => <div key={index} className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Section {index + 1}</h2><button type="button" disabled={draft.sections.length === 1} onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })} className={button}>Remove section {index + 1}</button></div>
        <label className="block font-semibold">Heading<input required maxLength={200} pattern=".*\S.*" value={section.heading} onChange={event => updateSection(index, { heading: event.target.value })} className={field} /></label>
        <label className="block font-semibold">Paragraphs<span className="block text-sm font-normal text-slate-600 dark:text-slate-400">Separate paragraphs with a blank line.</span><textarea rows={7} value={(section.paragraphs || []).join('\n\n')} onChange={event => updateSection(index, { paragraphs: event.target.value.split('\n\n') })} className={field} /></label>
        <div className="space-y-2">
          <p className="font-semibold">Bullet points</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Edit each bullet point below.</p>
          <ul aria-label={`Bullet points in section ${index + 1}`} className="space-y-3">
            {(section.items || []).map((item, itemIndex) => <li key={itemIndex} className="flex items-start gap-2 sm:gap-3">
              <span aria-hidden="true" className="mt-3 shrink-0 text-xl leading-6">•</span>
              <textarea aria-label={`Bullet point ${itemIndex + 1} in section ${index + 1}`} rows={3} maxLength={20000} value={item} onChange={event => updateSection(index, { items: section.items!.map((text, i) => i === itemIndex ? event.target.value : text) })} className={`${field} min-w-0 flex-1`} />
              <button type="button" aria-label={`Remove bullet point ${itemIndex + 1} in section ${index + 1}`} onClick={() => updateSection(index, { items: section.items!.filter((_, i) => i !== itemIndex) })} className={`${button} mt-1 shrink-0 !px-2`}><span aria-hidden="true">×</span></button>
            </li>)}
          </ul>
          <button type="button" onClick={() => updateSection(index, { items: [...(section.items || []), ''] })} className={button}>Add bullet point</button>
        </div>
      </div>)}
      <button type="button" disabled={draft.sections.length >= 50} onClick={() => setDraft({ ...draft, sections: [...draft.sections, { heading: '', paragraphs: [], items: [] }] })} className={button}>Add section</button>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button type="submit" className="rounded-xl bg-brand-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" onClick={onCancel} className={button}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
