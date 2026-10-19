import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { LinesSkeleton } from '../components/ui/PageLoading';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { verifyClearanceCertificate, type ClearanceVerification } from '../lib/clearanceCertificates';
import { formatManilaDate } from '../lib/dateTime';
import Button from '../components/ui/Button';

export default function VerifyClearance() {
 const { token = '' } = useParams();
 const [result, setResult] = useState<ClearanceVerification | null>(null), [error, setError] = useState('');
 const [retry, setRetry] = useState(0);
 useEffect(() => {
  let current = true; setResult(null); setError('');
  verifyClearanceCertificate(token).then(data => { if (current) setResult(data); }).catch(err => { if (current) setError(errorMessage(err)); });
  return () => { current = false; };
 }, [token, retry]);
 const valid = result?.found && result.valid;
 return <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-white">
  <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
   <p className="text-xs font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400">IARS · Certificate verification</p>
   <h1 className="text-2xl font-bold">Clearance verification</h1>
   {!result && !error && <div role="status" aria-label="Checking the official certificate record" aria-busy="true"><LinesSkeleton count={6} /></div>}
   {error && <div role="alert" className="space-y-3"><ErrorNotice error={error} operation="Verify Clearance"></ErrorNotice><Button onClick={() => setRetry(v => v + 1)}>Retry verification</Button></div>}
   {result && <><div className={`flex items-center gap-3 rounded-xl p-4 ${valid ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'}`}>
    {valid ? <ShieldCheck aria-hidden="true" /> : <ShieldX aria-hidden="true" />}<p className="font-bold">{valid ? 'Valid clearance certificate' : result.found ? 'Certificate is no longer valid' : 'Certificate not found'}</p>
   </div>{result.found && <dl className="space-y-4">{[
    ['Student', result.student_name], ['School', result.school_name], ['Clearing period', result.period_title],
    ['Reference', result.reference], ['Issue date', formatManilaDate(result.issued_at)], ['Cleared on', formatManilaDate(result.cleared_at)],
   ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>}
   <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{valid ? 'This verifies sanction clearance only. Other school requirements are assessed separately.' : 'Contact OSSA if you need confirmation or an updated certificate.'} Private attendance, sanction, and contact records are not displayed.</p></>}
   <Link to="/" className="inline-block py-2 text-sm font-semibold text-brand-800 underline dark:text-gold-300">Open IARS</Link>
  </section>
 </main>;
}
