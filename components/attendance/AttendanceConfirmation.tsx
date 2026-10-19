import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { appData } from '../../lib/backend';
import { formatManilaDateTime } from '../../lib/dateTime';
import { attendanceWindowTitle, eventDisplayTitle } from '../../lib/eventGroups';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import RecordedBy from './RecordedBy';

export default function AttendanceConfirmation() {
  const { profile, revision } = useAuth();
  const baseline = useRef<{ uid: string; records: Map<string, string> } | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  useEffect(() => {
    if (!profile?.uid) { baseline.current = null; setReceipts([]); return; }
    const records = appData.getAttendanceRecords(profile.uid);
    const fingerprint = (record: any) => `${record.time_in || ''}:${record.time_out || ''}`;
    const next = new Map<string, string>(records.map(record => [record.id, fingerprint(record)]));
    if (baseline.current?.uid === profile.uid) {
      const changes = records.filter(record => record.time_in && ['present', 'late'].includes(record.status)
        && baseline.current!.records.get(record.id) !== fingerprint(record));
      if (changes.length) setReceipts(queue => [...queue, ...changes]);
    } else setReceipts([]);
    baseline.current = { uid: profile.uid, records: next };
  }, [profile?.uid, revision]);
  const record = receipts[0];
  const close = () => setReceipts(queue => queue.slice(1));
  return <Modal open={Boolean(record)} onClose={close} title="Attendance saved successfully" description="Your attendance has been confirmed by the server." size="md" footer={<Button onClick={close}>{receipts.length > 1 ? 'Next confirmation' : 'Done'}</Button>}>
    {record && <div className="space-y-5">
      <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"><CheckCircle2 size={28} /><div><p className="font-bold">{record.time_out ? 'Check-out recorded' : 'Check-in recorded'}</p><p className="text-sm capitalize">Attendance status: {record.status}</p></div></div>
      <div><h3 className="text-lg font-bold text-brand-900 dark:text-white">{record.event ? eventDisplayTitle(record.event, appData.getEvents()) : 'Archived activity'}</h3><p className="mt-1 text-sm text-slate-500">{record.event ? attendanceWindowTitle(record.event, record.slot) : record.slot}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{[
        ['Student', profile?.name || ''], ['Time-in', formatManilaDateTime(record.time_in)],
        ['Time-out', record.time_out ? formatManilaDateTime(record.time_out) : 'Not recorded'],
        ['Location', record.event?.venue || 'Not specified'],
      ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="mb-3 text-xs font-semibold text-slate-500">Recorded by</p><RecordedBy uid={record.scanned_by_uid} name={record.scanned_by_name || 'System'} /></div>
      <p className="text-xs text-slate-500">All times are in Manila local time (UTC+8). This record is available in your attendance history.</p>
    </div>}
  </Modal>;
}
