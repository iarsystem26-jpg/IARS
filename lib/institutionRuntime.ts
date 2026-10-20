import type { InstitutionBranding } from './institutionBranding';

export const hubBackend = { url: import.meta.env.VITE_SUPABASE_URL || '', key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '' };
export const runtimeBackend = { ...hubBackend };
export let runtimeInstitution: (InstitutionBranding & { slug: string; legalName: string; supportEmail: string; privacyEmail: string; address: string; driveGasUrl?: string }) | null = null;

async function readPublic(url: string, key: string, table: string, query: string) {
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Institution setup is unavailable. Try again shortly.');
  return response.json();
}
/** Resolve only published routes from the trusted hub before importing any Auth client. */
export async function initializeInstitution() {
  const slug = new URLSearchParams(location.search).get('institution');
  if (slug) {
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)) throw new Error('Invalid institution link.');
    const rows = await readPublic(hubBackend.url, hubBackend.key, 'rmc_institution_routes', `slug=eq.${encodeURIComponent(slug)}&select=project_ref,publishable_key`);
    if (rows.length !== 1 || !/^[a-z]{20}$/.test(rows[0].project_ref) || !rows[0].publishable_key) throw new Error('This institution is not ready. Ask your administrator for its active institution link.');
    runtimeBackend.url = `https://${rows[0].project_ref}.supabase.co`;
    runtimeBackend.key = rows[0].publishable_key;
    if (runtimeBackend.url === hubBackend.url) throw new Error('Institution isolation is not configured correctly.');
  }
  if (!runtimeBackend.url || !runtimeBackend.key) return;
  try {
    const rows = await readPublic(runtimeBackend.url, runtimeBackend.key, 'rmc_institution_branding', 'id=eq.true&select=config');
    runtimeInstitution = rows[0]?.config || null;
    if (slug && runtimeInstitution?.slug !== slug) throw new Error('Institution identity does not match its link.');
  } catch (error) { if (slug) throw error; /* Older, unbranded hub deployments use build-time identity. */ }
}

export function institutionLink(slug: string) {
  const url = new URL(location.origin + location.pathname); url.searchParams.set('institution', slug); return url.href;
}
