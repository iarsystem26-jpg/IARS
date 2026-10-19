import { requireConfiguration, supabase } from './supabase';
import { LegalContent, LegalKind } from './legalPages';

export type SavedLegalPage = LegalContent & { kind: LegalKind; updated_at: string };

export async function loadLegalPage(kind: LegalKind): Promise<SavedLegalPage> {
  requireConfiguration();
  const { data, error } = await supabase.from('rmc_legal_pages')
    .select('kind,title,summary,sections,updated_at').eq('kind', kind).single();
  if (error) throw error;
  return data as SavedLegalPage;
}

export async function saveLegalPage(kind: LegalKind, content: LegalContent, version: string): Promise<SavedLegalPage> {
  requireConfiguration();
  const { data, error } = await supabase.from('rmc_legal_pages')
    .update({ title: content.title, summary: content.summary, sections: content.sections })
    .eq('kind', kind).eq('updated_at', version)
    .select('kind,title,summary,sections,updated_at').maybeSingle();
  if (error) throw new Error('Unable to save the page. Check your connection and admin access, then try again.');
  if (!data) throw new Error('The page changed or your admin access expired. Copy your edits, then reload the page before saving again.');
  return data as SavedLegalPage;
}
