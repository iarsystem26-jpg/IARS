import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, ExternalLink } from 'lucide-react';
import { InstitutionRecord, loadInstitutions, retryInstitution } from '../../lib/institutions';
import { institutionLink } from '../../lib/institutionRuntime';
import Button from '../ui/Button';
import { useNavigate } from 'react-router-dom';

export default function InstitutionDirectory() {
  const [records, setRecords] = useState<InstitutionRecord[]>([]);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setRecords(await loadInstitutions()); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load institutions.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10000); return () => clearInterval(timer); }, [refresh]);
  const retry = async (id: string) => { try { await retryInstitution(id); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Retry failed.'); } };
  return <section aria-label="Independent institutions" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-brand-900 dark:text-white"><Building2 size={20} /> Independent institutions</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Separate databases and accounts, with their own logo and dashboard colors.</p></div><Button fullWidth={false} onClick={() => navigate('/admin/institutions/new')}><Plus size={16} /> Add institution</Button></div>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {loading ? <p role="status" className="text-sm">Loading institutions…</p> : !records.length && !error ? <p className="text-sm text-slate-500 dark:text-slate-400">Create an institution here for an isolated workspace. Use the academic directory below for departments and classes in this institution.</p> : null}
    <div className="grid gap-3 xl:grid-cols-2">{records.map(record => <article key={record.id} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-600">
      <div className="flex gap-3"><img src={record.config.logoUrl || '/iars-icon.png'} alt={`${record.config.name} logo`} className="h-12 w-12 rounded-lg bg-white object-contain p-1" /><div className="min-w-0"><h3 className="break-words font-bold">{record.config.name}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{record.slug} · {record.status === 'active' ? 'Isolated workspace ready' : record.status === 'failed' ? 'Setup needs attention' : 'Setup pending'}</p></div></div>
      <p role="status" className="text-sm">{record.stage}</p>
      {record.admin_email_queued_at && <p className="text-xs text-slate-500 dark:text-slate-400">Administrator welcome email queued for delivery.</p>}
      {record.error && <p className="text-sm text-red-700 dark:text-red-300">{record.error}</p>}
      {record.status === 'active' && <div className="space-y-2"><a href={institutionLink(record.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-700 underline dark:text-brand-200">Open institution <ExternalLink size={14} /></a>{record.bootstrap_url && <details className="text-xs"><summary className="cursor-pointer py-2">Private first-access link for administrator</summary><p className="mb-2 text-slate-500 dark:text-slate-400">This grants first access to the institution administrator. Share it privately. It expires and can be used once.</p><a href={record.bootstrap_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center underline">Set up administrator password</a></details>}</div>}
      {record.status === 'failed' && <Button variant="secondary" size="sm" onClick={() => { void retry(record.id); }}>Retry setup</Button>}
      {['active','failed'].includes(record.status) && <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/institutions/${record.id}/edit`)}>Edit branding</Button>}
    </article>)}</div>
  </section>;
}
