import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Award, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { subscribeData } from '../../lib/backend';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Surface } from '../ui/Page';
import { formatManilaDate, formatManilaDateTime } from '../../lib/dateTime';
import { toast } from '../../lib/toast';
import { errorMessage } from '../../lib/errors';
import {
 clearanceVerificationUrl, createClearanceSchedule, issueClearanceCertificate, loadClearanceSchedules,
 releaseClearanceSchedule, type ClearanceCertificate, type ClearanceSchedule,
} from '../../lib/clearanceCertificates';

const control = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const failure = errorMessage;

export default function ClearanceCertificates({ manage = false }: { manage?: boolean }) {
 const { profile } = useAuth();
 const [revision, setRevision] = useState(0);
 useEffect(() => subscribeData(() => setRevision(value => value + 1)), []);
 const [rows, setRows] = useState<ClearanceSchedule[]>([]), [error, setError] = useState('');
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
 const [title, setTitle] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('');
 const [selected, setSelected] = useState<{ schedule: ClearanceSchedule; certificate: ClearanceCertificate } | null>(null);
 const [releaseTarget, setReleaseTarget] = useState<ClearanceSchedule | null>(null);
 const [preview, setPreview] = useState('');
 const qr = useRef<HTMLDivElement>(null);
 const [reload, setReload] = useState(0);
 const canManage = manage && ['ossa', 'ossa_staff'].includes(profile?.role || '');
 useEffect(() => { setSelected(null); setReleaseTarget(null); setRows([]); setLoading(true); }, [profile?.uid, manage]);
 useEffect(() => {
  let current = true; setError('');
  if (manage && !canManage) { setLoading(false); return; }
  loadClearanceSchedules(manage).then(data => { if (current) setRows(data); })
   .catch(err => { if (current) setError(failure(err)); }).finally(() => { if (current) setLoading(false); });
  return () => { current = false; };
 }, [profile?.uid, revision, manage, canManage, reload]);
 useEffect(() => {
  if (!selected) { setPreview(''); return; }
  let current = true, objectUrl = '';
  const svg = qr.current?.querySelector('svg');
  if (svg) import('../../lib/clearanceCertificatePdf').then(async ({ prepareClearanceCertificatePdf }) => {
    const c = selected.certificate;
    const doc = await prepareClearanceCertificatePdf(c, svg, clearanceVerificationUrl(c.token));
    objectUrl = URL.createObjectURL(doc.output('blob'));
    if (current) setPreview(objectUrl); else URL.revokeObjectURL(objectUrl);
  }).catch(err => { if (current) setError(failure(err)); });
  return () => { current = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
 }, [selected]);

 async function request(row: ClearanceSchedule) {
  setBusy(true); setError('');
  try { const certificate = await issueClearanceCertificate(row.id); setSelected({ schedule: row, certificate }); }
  catch (err) { setError(failure(err)); } finally { setBusy(false); }
 }
 async function download() {
  if (!selected || !qr.current || busy) return;
  setBusy(true); setError('');
  try {
   // Always ask the server again, including when an old preview remains open.
   const c = await issueClearanceCertificate(selected.schedule.id);
   if (c.id !== selected.certificate.id) { setSelected({ ...selected, certificate: c }); throw new Error('Your certificate changed. Review the refreshed preview and download again.'); }
   const svg = qr.current.querySelector('svg'); if (!svg) throw new Error('QR unavailable. Reopen the preview.');
   const { downloadClearanceCertificate } = await import('../../lib/clearanceCertificatePdf');
   await downloadClearanceCertificate(c, svg, clearanceVerificationUrl(c.token));
   toast.success('Certificate PDF download started');
  } catch (err) { setError(failure(err)); } finally { setBusy(false); }
 }
 async function create(event: React.FormEvent) {
  event.preventDefault(); setBusy(true); setError('');
  try { setRows(await createClearanceSchedule(title, start, end)); setTitle(''); setStart(''); setEnd(''); toast.success('Clearing schedule created. Certificates are on hold.'); }
  catch (err) { setError(failure(err)); } finally { setBusy(false); }
 }
 async function release() {
  if (!releaseTarget) return;
  setBusy(true); setError('');
  try { setRows(await releaseClearanceSchedule(releaseTarget.id, !releaseTarget.release_enabled)); setReleaseTarget(null); toast.success('Certificate release updated'); }
  catch (err) { setError(failure(err)); } finally { setBusy(false); }
 }

 if (manage && !canManage) return <Surface className="p-5"><p>An assigned OSSA account with case-management access manages clearing schedules and release.</p></Surface>;
 return <Surface className="space-y-5 p-5 sm:p-6" aria-label="Clearance certificates">
  <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Award className="shrink-0 text-gold-600" size={25} /><div>
   <h2 className="text-lg font-bold text-brand-900 dark:text-white">Clearance certificates</h2>
   <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{manage ? 'Schedule sanction clearing and authorize certificate release for your assigned academic scope.' : 'A verifiable A4 landscape certificate, released by OSSA after you clear your sanctions during a scheduled period.'}</p>
  </div></div><Button variant="secondary" iconOnly aria-label="Refresh certificates" disabled={busy || loading} onClick={() => setReload(v => v + 1)}><RefreshCw size={16} /></Button></div>
  {error && <ErrorNotice error={error} operation="Clearance Certificates"></ErrorNotice>}
  {loading && <p role="status" className="text-sm">Checking clearance schedules…</p>}
  {manage && <form onSubmit={create} className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
   <h3 className="font-semibold">New clearing schedule</h3>
   <label className="block text-sm font-medium">Period name<input className={control} value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={120} placeholder="First semester clearance" required /></label>
   <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Starts (Philippine time)<input className={control} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required /></label>
    <label className="block text-sm font-medium">Ends (Philippine time)<input className={control} type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required /></label></div>
   <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Create the schedule before clearing begins. Dates cannot be backdated or edited. Release starts on hold and can be enabled during or after the period. Existing zero balances do not qualify without a sanction-clearing transition during this schedule.</p>
   <Button type="submit" fullWidth={false} disabled={busy || loading}>Create clearing schedule</Button>
  </form>}
  {!loading && !error && !rows.length && <p className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">No clearing schedules are available. OSSA will publish the clearing period here.</p>}
  <div className="space-y-3">{rows.map(row => <article key={row.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
   <div className="min-w-0"><h3 className="break-words font-bold">{row.title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatManilaDateTime(row.starts_at)} – {formatManilaDateTime(row.ends_at)} (PH)</p>
    <p className="mt-2 text-sm font-medium">{manage ? `${row.eligible_count || 0} eligible · ${row.issued_count || 0} issued · ${row.release_enabled ? 'Release enabled' : 'Release on hold'}` : !row.eligible ? 'Not eligible: sanctions must reach zero during this clearing period.' : row.release_enabled ? 'Eligible · OSSA has authorized release' : 'Qualified · Waiting for OSSA release'}</p>
   </div>
   {manage ? <Button fullWidth={false} variant={row.release_enabled ? 'secondary' : 'gold'} disabled={busy} onClick={() => setReleaseTarget(row)}>{row.release_enabled ? 'Hold release' : 'Enable release'}</Button>
    : <Button fullWidth={false} disabled={busy || !row.eligible || !row.release_enabled} onClick={() => request(row)}><ShieldCheck size={16} />{row.certificate ? 'View certificate' : 'Request certificate'}</Button>}
  </article>)}</div>
  <Modal open={!!releaseTarget} onClose={() => { if (!busy) setReleaseTarget(null); }} title={releaseTarget?.release_enabled ? 'Hold certificate release' : 'Authorize certificate release'} size="md">
   <p className="text-sm leading-6">{releaseTarget?.release_enabled ? 'Pause new downloads for this period. Already issued certificates retain their verification history.' : 'Allow eligible students who cleared sanctions during this period to request and download their certificates.'}</p>
   <p className="my-4 font-bold">{releaseTarget?.title}</p>
   <Button onClick={release} disabled={busy}>Confirm {releaseTarget?.release_enabled ? 'hold' : 'release'}</Button>
  </Modal>
  <Modal open={!!selected} onClose={() => { if (!busy) setSelected(null); }} title="Your clearance certificate" size="xl">
   {selected && <div className="space-y-4">
    <div ref={qr} className="sr-only" aria-hidden="true"><QRCode value={clearanceVerificationUrl(selected.certificate.token)} size={384} level="M" /></div>
    <p className="break-all text-xs text-slate-500 dark:text-slate-400">{selected.certificate.reference} · Issued {formatManilaDate(selected.certificate.issued_at)}</p>
    {preview ? <iframe title="A4 landscape clearance certificate preview" src={preview} className="h-[55vh] w-full rounded-xl border border-slate-200 bg-white" /> : <p role="status">Preparing your certificate preview…</p>}
    <p className="text-sm leading-6">The verification QR shows only your name, school, clearing period, reference, dates, and current certificate validity.</p>
    {error && <ErrorNotice error={error} operation="Clearance Certificates"></ErrorNotice>}
    <Button onClick={download} disabled={busy}><Download size={16} /> Download A4 landscape PDF</Button>
   </div>}
  </Modal>
 </Surface>;
}
