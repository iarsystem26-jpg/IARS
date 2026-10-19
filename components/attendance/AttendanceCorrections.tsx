import { selectUploadFile } from '../../lib/fileUploads';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, ExternalLink, FilePenLine, FileUp, Info, Paperclip, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { hasPermission } from '../../lib/accessControl';
import { documentUrl, uploadDocument } from '../../lib/backend';
import { formatManilaDate, formatManilaDateTime, formatManilaTime } from '../../lib/dateTime';
import { requestError } from '../../lib/profileRequests';
import { toast } from '../../lib/toast';
import {
 correctionEvidenceError, correctionKey, correctionStatus, correctionTimeError, loadAttendanceCorrections,
 loadCorrectionOptions, manilaInput, previewCorrectionCredit, reviewAttendanceCorrection, submitAttendanceCorrection,
 type AttendanceCorrection, type CorrectionAttendance, type CorrectionOption, type CreditAdjustment,
} from '../../lib/attendanceCorrections';
import ApprovalQueue, { ApprovalStatus, approvalControl, approvalLabel } from '../ui/ApprovalQueue';
import Button from '../ui/Button';
import DetailFields from '../ui/DetailFields';
import { Modal } from '../ui/Modal';
import { Surface } from '../ui/Page';
import CustomSelect from '../ui/CustomSelect';
import { TimeInput } from '../ui/TimeInput';

function CreditPreview({ plan }: { plan: CreditAdjustment }) {
 return <section aria-label="Credit change preview" className="space-y-3 rounded-xl border border-gold-300 p-4 dark:border-gold-700">
  <h3 className="font-bold">{plan.kind === 'merit' ? 'Activity credit adjustment' : 'Session credit adjustment'}</h3>
  <dl className="grid gap-3 sm:grid-cols-2">{[
   ['Rendered time', plan.rendered_before, plan.rendered_after], ['Sanctions cleared', plan.cleared_before, plan.cleared_after],
   ['Saved merit', plan.merit_before, plan.merit_after], ['Outstanding sanctions', plan.balance_before, plan.balance_after],
  ].map(([label, before, after]) => <div key={String(label)}><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 font-semibold">{Number(before).toFixed(2)} → {Number(after).toFixed(2)} hours</dd></div>)}</dl>
  {plan.kind === 'merit' && <p className="text-sm">{plan.complete ? 'All required sessions are complete. The fixed award applies once.' : 'Required attendance is incomplete. The fixed award is unavailable.'}</p>}
  <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Reducing credit removes saved merit first, then restores previously cleared sanctions. Original awards stay in the history.</p>
 </section>;
}

const muted = 'text-sm leading-6 text-slate-500 dark:text-slate-400';

function ChangePreview({ original, timeIn, timeOut, option, valid, attended }: {
 original: CorrectionAttendance | null; timeIn: string; timeOut: string; option: CorrectionOption; valid: boolean; attended: boolean;
}) {
 const status = attended && !timeIn ? 'Arrival time needed' : valid ? correctionStatus(timeIn, option) : 'Check the times';
 const before = [original?.status || 'Missing record', original?.time_in ? formatManilaDateTime(original.time_in) : 'Not recorded', original?.time_out ? formatManilaDateTime(original.time_out) : 'Not recorded'];
 const after = [status, timeIn ? formatManilaDateTime(timeIn) : attended ? 'Add your arrival time' : 'No attendance', timeOut ? formatManilaDateTime(timeOut) : 'No checkout requested'];
 return <section aria-label="Attendance change preview" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-brand-900 dark:text-white">Preview your change</h3><span className="rounded-full bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-800 dark:bg-gold-950 dark:text-gold-300">Subject to OSSA approval</span></div>
  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
   {[{ title: 'Current record', values: before }, { title: 'Requested change', values: after }].map((item, index) => <div key={item.title} className="contents">
    {index === 1 && <div aria-hidden="true" className="flex items-center justify-center text-gold-600 dark:text-gold-400"><ArrowRight size={20} className="rotate-90 sm:rotate-0" /></div>}
    <section aria-label={item.title} className={`min-w-0 rounded-xl p-3 ${index ? 'border border-gold-300 bg-gold-50/60 dark:border-gold-600/40 dark:bg-gold-950/20' : 'bg-slate-50 dark:bg-slate-900/60'}`}>
     <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.title}</h4>
     <dl className="space-y-3">{['Status', 'Time-in', 'Time-out'].map((label, i) => <div key={label}><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold capitalize text-brand-900 dark:text-white">{item.values[i]}</dd></div>)}</dl>
    </section>
   </div>)}
  </div>
  {['service', 'merit'].includes(option.kind || '') && <p className={`${muted} mt-3`}>Rendered time: {Number(original?.rendered_hours || 0).toFixed(2)} → {valid && timeIn && timeOut ? ((Date.parse(timeOut + '+08:00') - Date.parse(timeIn + '+08:00')) / 3600000).toFixed(2) : '0.00'} hours. OSSA reviews the resulting sanctions and merit adjustment before approval.</p>}
  <p className={`${muted} mt-3`}>Submitting a request does not change your record or sanction balance. OSSA will verify the times before applying a correction.</p>
 </section>;
}

function CorrectionTimeField({ label, value, onChange, option, disabled }: {
 label: string; value: string; onChange: (value: string) => void; option: CorrectionOption; disabled: boolean;
}) {
 const firstDay = manilaInput(option.starts_at).slice(0, 10), lastDay = manilaInput(option.ends_at).slice(0, 10);
 const day = value.split('T')[0] || firstDay;
 const days = [];
 for (let stamp = Date.parse(`${firstDay}T00:00:00+08:00`); stamp <= Date.parse(`${lastDay}T00:00:00+08:00`); stamp += 86400000) {
  const date = manilaInput(stamp).slice(0, 10); days.push({ value: date, label: formatManilaDate(date) });
 }
 return <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{label}</span><button type="button" disabled={disabled || !value} onClick={() => onChange('')} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700" aria-label={`Clear ${label.toLowerCase()}`}>Clear</button></div>
  {days.length > 1 ? <CustomSelect ariaLabel={`${label} date (Manila)`} options={days} value={day} onChange={next => onChange(`${next}T${value.split('T')[1] || '00:00'}`)} disabled={disabled} /> : <p className="text-xs text-slate-500 dark:text-slate-400">{formatManilaDate(firstDay)}</p>}
  <TimeInput aria-label={label} value={value.split('T')[1]?.slice(0, 5) || ''} disabled={disabled} className="input-field min-h-12 text-sm" onChange={event => onChange(event.target.value ? `${day}T${event.target.value}` : '')} />
 </div>;
}

function AttendanceSnapshot({ title, record }: { title: string; record: CorrectionAttendance | null }) {
 return <section className="space-y-2"><h3 className="font-bold">{title}</h3>{record ? <DetailFields fields={[
  { label: 'Status', value: record.status },
  { label: 'Time-in', value: record.time_in ? formatManilaDateTime(record.time_in) : 'Not recorded' },
  { label: 'Time-out', value: record.time_out ? formatManilaDateTime(record.time_out) : 'Not recorded' },
  { label: 'Recorded by', value: record.scanned_by_name || 'System' },
  { label: 'Recorded at', value: record.recorded_at ? formatManilaDateTime(record.recorded_at) : 'Not recorded' },
 ]} /> : <p className="text-slate-500 dark:text-slate-400">No attendance record was saved for this session.</p>}</section>;
}

export default function AttendanceCorrections({ review = false, target, onTargetHandled }: {
 review?: boolean; target?: { eventId: string; slot: string } | null; onTargetHandled?: () => void;
}) {
 const { profile } = useAuth();
 const eligible = Boolean(profile && (review
  ? ['admin', 'ossa', 'ossa_staff'].includes(profile.role) && hasPermission(profile.role, 'ossa.manage_cases')
  : ['student', 'mayor', 'ssg'].includes(profile.role)));
 const [rows, setRows] = useState<AttendanceCorrection[]>([]);
 const [options, setOptions] = useState<CorrectionOption[]>([]);
 const [loading, setLoading] = useState(true), [error, setError] = useState('');
 const [busy, setBusy] = useState(false), [openingProof, setOpeningProof] = useState(false);
 const [reporting, setReporting] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null);
 const [key, setKey] = useState(''), [reason, setReason] = useState(''), [note, setNote] = useState('');
 const [timeIn, setTimeIn] = useState(''), [timeOut, setTimeOut] = useState('');
 const [file, setFile] = useState<File | null>(null);
 const [credit, setCredit] = useState<{ key: string; plan: CreditAdjustment } | null>(null);
 const [creditError, setCreditError] = useState(''), [creditLoading, setCreditLoading] = useState(false);
 const [previewVersion, setPreviewVersion] = useState(0);
 const [attendanceIntent, setAttendanceIntent] = useState<'attended' | 'absent'>('attended');
 const formId = useId(), fileInputId = useId();
 const fileInput = useRef<HTMLInputElement>(null);
 const saving = useRef(false), sequence = useRef(0);
 const uid = profile?.uid;
 const selected = rows.find(row => row.id === selectedId);
 const option: CorrectionOption | undefined = review && selected ? {
  event_id: selected.event_id, event_title: selected.event_title, slot: selected.slot, label: selected.slot,
  starts_at: selected.session_starts_at, ends_at: selected.session_ends_at, late_at: selected.session_late_at, original: selected.original, kind: selected.kind,
 } : options.find(row => correctionKey(row.event_id, row.slot) === key);
 const load = async () => {
  const request = ++sequence.current;
  try {
   const [history, sessions] = await Promise.all([loadAttendanceCorrections(review ? undefined : uid), review ? Promise.resolve([]) : loadCorrectionOptions()]);
   if (request === sequence.current) { setRows(history); setOptions(sessions); setError(''); }
  } catch (err) { if (request === sequence.current) setError(requestError(err)); }
  finally { if (request === sequence.current) setLoading(false); }
 };
 useEffect(() => {
  setRows([]); setOptions([]); setSelectedId(null); setReporting(false); setLoading(true); setError('');
  if (!eligible) { setLoading(false); return; }
  void load();
  const reload = () => { if (!saving.current) void load(); };
  window.addEventListener('rmc_data_update', reload);
  const timer = window.setInterval(reload, 30000);
  return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener('rmc_data_update', reload); };
 }, [uid, eligible, review]);
 const choose = (value: string) => {
  setKey(value);
  const session = options.find(row => correctionKey(row.event_id, row.slot) === value);
  setTimeIn(manilaInput(session?.original?.time_in)); setTimeOut(manilaInput(session?.original?.time_out));
  setAttendanceIntent('attended');
 };
 useEffect(() => {
  if (!target || loading || !eligible || review) return;
  const value = correctionKey(target.eventId, target.slot);
  if (options.some(row => correctionKey(row.event_id, row.slot) === value)) {
   choose(value); setReason(''); setFile(null); setError(''); setReporting(true);
  } else setError('This session is unavailable for correction or already has a pending request. Contact OSSA if needed.');
  onTargetHandled?.();
 }, [target, loading, eligible, review, options]);
 const creditKind = ['service', 'merit'].includes(option?.kind || '');
 const previewKey = JSON.stringify([selected?.id, timeIn, timeOut, previewVersion]);
 const creditValid = credit?.key === previewKey;
 useEffect(() => {
  setCredit(null); setCreditError(''); setCreditLoading(false);
  if (!review || !selected || selected.status !== 'pending' || !creditKind || correctionTimeError(timeIn, timeOut, option) || (attendanceIntent === 'attended' && !timeIn)) return;
  let active = true;
  setCreditLoading(true);
  const timer = window.setTimeout(() => {
   void previewCorrectionCredit(selected.id, timeIn, timeOut).then(plan => { if (active) setCredit({ key: previewKey, plan }); })
    .catch(err => { if (active) setCreditError(requestError(err)); }).finally(() => { if (active) setCreditLoading(false); });
  }, 250);
  return () => { active = false; window.clearTimeout(timer); };
 }, [previewKey, review, selected?.status, creditKind, attendanceIntent]);
 if (!eligible) return null;
 const timeError = attendanceIntent === 'attended' && !timeIn ? 'Enter the time you arrived, or choose “Mark me absent” if the attendance entry is incorrect.' : correctionTimeError(timeIn, timeOut, option);
 const fileError = correctionEvidenceError(file);
 const submit = async (event: React.FormEvent) => {
  event.preventDefault();
  if (!option || saving.current || timeError || fileError || reason.trim().length < 10) return;
  saving.current = true; setBusy(true); setError('');
  try {
   const proof = file ? await uploadDocument(file, 'corrections') : undefined;
   await submitAttendanceCorrection(option, reason, timeIn, timeOut, proof);
   setReporting(false); toast.success('Attendance correction submitted for OSSA review.'); await load();
  } catch (err) { setError(requestError(err)); }
  finally { saving.current = false; setBusy(false); }
 };
 const decide = async (decision: 'approved' | 'rejected') => {
  if (!selected || saving.current || note.trim().length < 5 || (decision === 'approved' && (timeError || (creditKind && !creditValid)))) return;
  saving.current = true; setBusy(true); setError('');
  try {
   if (creditKind && decision === 'approved') await reviewAttendanceCorrection(selected.id, decision, note, timeIn, timeOut, credit!.plan);
   else await reviewAttendanceCorrection(selected.id, decision, note, timeIn, timeOut);
   setSelectedId(null); toast.success(`Attendance correction ${decision}.`); await load();
  } catch (err) { setError(requestError(err)); setPreviewVersion(v => v + 1); }
  finally { saving.current = false; setBusy(false); }
 };
 const openProof = async () => {
  if (!selected?.proof_url || openingProof) return;
  const tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null;
  setOpeningProof(true);
  try { const url = await documentUrl(selected.proof_url); if (tab) tab.location.href = url; else setError('Allow pop-ups to open the evidence.'); }
  catch (err) { tab?.close(); setError(requestError(err)); }
  finally { setOpeningProof(false); }
 };
 const timeInputs = (verified: boolean) => option && <fieldset disabled={busy} className="min-w-0 space-y-3">
  <legend className="mb-2 font-bold text-brand-900 dark:text-white">{verified ? 'Verified attendance' : '2. Tell us what should be recorded'}</legend>
  <CustomSelect label={verified ? 'Verified attendance outcome' : 'What should this record show?'} ariaLabel="Attendance outcome" value={attendanceIntent} disabled={busy} options={[
   { value: 'attended', label: verified ? 'Attended — enter verified times' : 'I attended — correct my attendance times' },
   { value: 'absent', label: verified ? 'Absent — remove incorrect attendance times' : 'Mark me absent — this attendance entry is incorrect' },
  ]} onChange={value => { setAttendanceIntent(value as 'attended' | 'absent'); if (value === 'absent') { setTimeIn(''); setTimeOut(''); } }} />
  {attendanceIntent === 'attended' ? <>
   <p className={muted}>Enter when you arrived. Add your departure time only if checkout needs correcting. Use Philippine time (UTC+8).</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <CorrectionTimeField label={verified ? 'Verified time-in' : 'Requested time-in'} value={timeIn} onChange={setTimeIn} option={option} disabled={busy} />
    <CorrectionTimeField label={verified ? 'Verified time-out' : 'Requested time-out'} value={timeOut} onChange={setTimeOut} option={option} disabled={busy} />
   </div>
   <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{creditKind ? 'Completed check-in and checkout are required to earn credit.' : 'Time-out is optional.'} Arrival after {formatManilaTime(option.late_at)} is marked late automatically.</p>
  </> : <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">You are requesting absent status with no attendance times. {creditKind ? 'This removes service or merit credit and may restore previously cleared sanctions.' : 'This may add an absence sanction. If you missed the activity for a valid reason, submit an excuse instead.'}</p>}
  {timeError && timeIn ? <ErrorNotice error={timeError} operation="Attendance Corrections"></ErrorNotice> : <p role="status" className="text-sm">{attendanceIntent === 'attended' && !timeIn ? 'Add your arrival time to preview the attendance status.' : `Status: ${correctionStatus(timeIn, option)}`}</p>}
  <ChangePreview original={verified ? selected?.original || null : option.original} timeIn={timeIn} timeOut={timeOut} option={option} valid={!timeError} attended={attendanceIntent === 'attended'} />
 </fieldset>;
 return <Surface aria-label={review ? 'Attendance corrections review' : 'Attendance corrections'} className="space-y-4 p-4 sm:p-5">
  {!review && <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-lg">Attendance corrections</h2><p className="text-sm text-slate-500 dark:text-slate-400">Report recording mistakes within 30 days after an institutional event, ceremony, service, or merit activity ends. For an absence reason, use the excuse workflow.</p></div>
   <Button fullWidth={false} variant="secondary" disabled={loading || busy} onClick={() => { choose(''); setReason(''); setFile(null); setError(''); setReporting(true); }}><FilePenLine size={16} />Report a problem / missing record</Button></div>}
  {loading && <p role="status">Loading attendance corrections...</p>}
  {error && <ErrorNotice error={error} operation="Attendance Corrections"><button type="button" className="underline" disabled={busy} onClick={() => void load()}>Refresh requests</button></ErrorNotice>}
  {!loading && <ApprovalQueue title={review ? 'Attendance correction queue' : 'My correction requests'} description={review ? 'Review the original recording, student evidence, and verified times. Approval reconciles attendance penalties or service and merit credits.' : 'Your original records remain available in each request alongside the decision.'}
   initialStatus={review ? 'pending' : 'all'}
   rows={rows.map(row => ({ id: row.id, title: `${row.event_title} / ${row.slot}${review ? ` - ${row.student_name}` : ''}`, status: row.status, searchText: `${row.student_number} ${row.reason}`, subtitle: `${row.status} · ${formatManilaDateTime(row.created_at)}` }))}
   onOpen={row => { const item = rows.find(r => r.id === row.id)!; setSelectedId(row.id); setKey(''); setNote(''); setTimeIn(manilaInput(item.proposed_time_in)); setTimeOut(manilaInput(item.proposed_time_out)); setAttendanceIntent(item.proposed_time_in ? 'attended' : 'absent'); setError(''); }} />}
  <Modal open={reporting} onClose={() => { if (!busy) setReporting(false); }} title="Report an attendance problem" description="Ask OSSA to review a missing scan or an incorrect attendance entry." size="lg"
   footer={<><Button variant="secondary" fullWidth={false} disabled={busy} onClick={() => setReporting(false)}>{options.length ? 'Cancel' : 'Close'}</Button>{options.length ? <Button type="submit" form={formId} variant="gold" fullWidth={false} disabled={busy || !option || reason.trim().length < 10 || Boolean(timeError || fileError)}>{busy ? 'Submitting...' : 'Submit for OSSA review'}</Button> : <Button fullWidth={false} disabled={loading} onClick={() => void load()}>Refresh sessions</Button>}</>}>
   {!options.length ? <div className="space-y-4">
    <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/50"><CalendarClock size={28} className="mb-3 text-gold-600 dark:text-gold-400" /><h3 className="font-bold text-brand-900 dark:text-white">No sessions available for correction</h3><p className={`${muted} mt-2`}>You can request corrections for institutional events, flag ceremonies, service, and merit activities that ended within the last 30 days.</p></div>
    <div className="space-y-2"><h3 className="text-sm font-bold">What you can do next</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300"><li>Wait until your activity ends, then refresh the sessions.</li><li>Check your request history if you already submitted a correction.</li><li>Contact OSSA if the activity is older, has an excuse request, or belongs to an organization or involves volunteer credit.</li></ul></div>
    {error && <ErrorNotice error={error} operation="Attendance Corrections"></ErrorNotice>}
   </div> : <form id={formId} onSubmit={submit} className="space-y-6">
    <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-3 dark:bg-brand-950/40"><Info size={18} className="mt-0.5 shrink-0 text-brand-700 dark:text-gold-400" /><p className="text-sm leading-6 text-brand-900 dark:text-slate-200">Choose the session, enter the correct attendance, then explain the mistake. Review the comparison before submitting.</p></div>
    <div className="space-y-3"><h3 className="font-bold text-brand-900 dark:text-white">1. Choose the activity and session</h3>
     <CustomSelect ariaLabel="Activity and session" combobox searchable searchPlaceholder="Search activity or session" placeholder="Choose a completed session" disabled={busy} value={key} onChange={value => choose(String(value))} options={options.map(row => ({ value: correctionKey(row.event_id, row.slot), label: `${row.event_title} / ${row.label} / ${formatManilaDate(row.starts_at)}`, searchText: `${row.slot} ${row.original?.status || 'missing record'}` }))} />
     {option ? <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><p className="text-sm font-semibold">{formatManilaDateTime(option.starts_at)} – {formatManilaDateTime(option.ends_at)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The requested times must fit inside this session.</p></div> : <p className={muted}>Choose the exact session where your record is missing or incorrect.</p>}
    </div>
    {option && <>
     {timeInputs(false)}
     <section className="space-y-3"><h3 className="font-bold text-brand-900 dark:text-white">3. Explain what happened</h3>
      <label className={approvalLabel} htmlFor={`${formId}-reason`}>Explain the recording mistake</label><textarea id={`${formId}-reason`} aria-label="Explain the recording mistake" aria-describedby={`${formId}-reason-help`} required minLength={10} maxLength={2000} rows={3} disabled={busy} className={approvalControl} placeholder="Example: I arrived at 8:05 AM, but my QR scan was not saved. The officer can confirm I attended." value={reason} onChange={event => setReason(event.target.value)} />
      <div id={`${formId}-reason-help`} className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>Include the scan problem and who can verify your attendance.</span><span>{reason.trim().length}/2,000 characters · minimum 10</span></div>
     </section>
     <section className="space-y-3"><h3 className="font-bold text-brand-900 dark:text-white">4. Add evidence <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span></h3><p className={muted}>A screenshot, attendance photo, or document can help OSSA verify the mistake. Choose PDF, JPG, PNG, or WebP, up to 5 MB.</p>
      <input ref={fileInput} id={fileInputId} aria-label="Supporting evidence" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} className="sr-only" onChange={event => setFile(selectUploadFile(event.currentTarget) || null)} />
      <div className={`rounded-2xl border-2 border-dashed p-4 ${fileError ? 'border-red-300 dark:border-red-800' : 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40'}`}>
       {file ? <div className="flex min-w-0 items-center gap-3"><Paperclip size={22} className="shrink-0 text-gold-600 dark:text-gold-400" /><div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{file.name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB · {fileError ? 'Choose another file' : 'Ready to attach'}</p></div><Button iconOnly aria-label="Remove supporting evidence" variant="secondary" disabled={busy} onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}><X size={16} /></Button></div> : <div className="flex flex-col items-center gap-2 text-center"><FileUp size={26} className="text-slate-400" /><p className="text-sm font-semibold">Choose a supporting file</p><p className="text-xs text-slate-500 dark:text-slate-400">Your file will be shared with authorized reviewers.</p></div>}
       <Button variant="secondary" fullWidth={false} className="mt-3" disabled={busy} onClick={() => fileInput.current?.click()}><FileUp size={16} />{file ? 'Replace file' : 'Choose file'}</Button>
      </div>
      {fileError && <ErrorNotice error={fileError} operation="Attendance Corrections"></ErrorNotice>}
     </section>
    </>}
    {error && <ErrorNotice error={error} operation="Attendance Corrections"></ErrorNotice>}
   </form>}
  </Modal>
  <Modal open={Boolean(selected)} onClose={() => { if (!busy && !openingProof) setSelectedId(null); }} title="Attendance correction request" size="lg"
   footer={review && selected?.status === 'pending' ? <><Button variant="danger" disabled={busy || note.trim().length < 5} onClick={() => decide('rejected')}>Reject correction</Button><Button variant="gold" disabled={busy || selected.student_id === uid || note.trim().length < 5 || Boolean(timeError) || (creditKind && !creditValid)} onClick={() => decide('approved')}>{busy ? 'Saving...' : 'Approve correction'}</Button></> : undefined}>
   {selected && <div className="space-y-4 text-sm">
    <ApprovalStatus status={selected.status} />
    <DetailFields fields={[{ label: 'Student', value: `${selected.student_name} (${selected.student_number})` }, { label: 'Activity / session', value: `${selected.event_title} / ${selected.slot}` }, { label: 'Submitted', value: formatManilaDateTime(selected.created_at) },
     { label: 'Session starts', value: formatManilaDateTime(selected.session_starts_at) }, { label: 'Session ends', value: formatManilaDateTime(selected.session_ends_at) }, { label: 'Late after', value: formatManilaDateTime(selected.session_late_at) }]} />
    <AttendanceSnapshot title="Original recording at submission" record={selected.original} />
    <div><h3 className="font-bold">Student explanation</h3><p className="whitespace-pre-wrap break-words">{selected.reason}</p></div>
    <DetailFields fields={[{ label: 'Requested time-in', value: selected.proposed_time_in ? formatManilaDateTime(selected.proposed_time_in) : 'Absent (no time-in)' }, { label: 'Requested time-out', value: selected.proposed_time_out ? formatManilaDateTime(selected.proposed_time_out) : 'Not requested' }]} />
    {selected.proof_url && <Button variant="secondary" fullWidth={false} disabled={openingProof} onClick={openProof}><ExternalLink size={16} />{openingProof ? 'Opening...' : 'View supporting evidence'}</Button>}
    {review && selected.status === 'pending' ? <>{timeInputs(true)}{creditKind ? <>
      {creditLoading && <p role="status">Calculating credit adjustment...</p>}
      {creditValid && <CreditPreview plan={credit!.plan} />}
      {creditError && <ErrorNotice error={creditError} operation="Attendance Corrections"></ErrorNotice>}
      <Button variant="secondary" fullWidth={false} disabled={busy || creditLoading} onClick={() => setPreviewVersion(v => v + 1)}>Refresh credit preview</Button>
     </> : <p className="text-slate-500 dark:text-slate-400">Approval adjusts this session's penalty. Reductions stop at the outstanding balance; previously completed service is preserved.</p>}<label className={approvalLabel}>Decision notes (required)<textarea aria-label="Decision notes" className={approvalControl} required minLength={5} maxLength={2000} rows={3} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></label></> : selected.status !== 'pending' && <>
     {selected.credit_adjustment && <CreditPreview plan={selected.credit_adjustment} />}
     {selected.corrected && <AttendanceSnapshot title="Approved corrected recording" record={selected.corrected} />}
     <DetailFields fields={[{ label: 'Decision notes', value: selected.review_note }, { label: 'Reviewer', value: selected.reviewer_name || '' }, { label: 'Reviewed', value: formatManilaDateTime(selected.reviewed_at) }, { label: 'Sanction balance adjustment', value: `${Number(selected.sanction_change).toFixed(2)} hours` }]} />
    </>}
    {error && <ErrorNotice error={error} operation="Attendance Corrections"></ErrorNotice>}
   </div>}
  </Modal>
 </Surface>;
}
