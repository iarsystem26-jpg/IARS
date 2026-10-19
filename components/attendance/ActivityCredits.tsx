import { formatHourDuration } from '../../lib/duration';
import React from 'react';
import { appData } from '../../lib/backend';
import { formatManilaDateTime } from '../../lib/dateTime';
import { attendanceWindowTitle, eventDisplayTitle } from '../../lib/eventGroups';
import { usePagination } from '../usePagination';
import RecordPagination from '../ui/RecordPagination';
import DetailFields from '../ui/DetailFields';
import { Surface } from '../ui/Page';
import type { AppEvent } from '../../types';

type CreditRecord = { id: string; event?: AppEvent; slot: string; time_in?: number; time_out?: number; recorded_at?: number; rendered_hours?: number; deducted_hours?: number; merit_earned_hours?: number; completion_pending?: boolean };

export default function ActivityCredits({ records, uid, onOpen }: { records: CreditRecord[]; uid: string; onOpen: (id: string) => void }) {
  const sorted = [...records].sort((a, b) => Number(b.time_in || b.recorded_at || b.event?.startTime || 0) - Number(a.time_in || a.recorded_at || a.event?.startTime || 0) || b.id.localeCompare(a.id));
  const pagination = usePagination(sorted, uid);
  const title = (record: CreditRecord) => record.event ? eventDisplayTitle(record.event, appData.getEvents()) : 'Archived activity';
  const session = (record: CreditRecord) => record.event ? attendanceWindowTitle(record.event, record.slot) || 'Default session' : 'Archived session';
  const fields = (record: CreditRecord) => [
    { label: 'Rendered hours', value: formatHourDuration(record.rendered_hours || 0) },
    { label: 'Sanctions cleared', value: formatHourDuration(record.deducted_hours || 0) },
    { label: 'Merit earned', value: formatHourDuration(record.merit_earned_hours || 0) },
  ];
  const status = (record: CreditRecord) => !record.time_out ? 'Awaiting scan-out' : record.completion_pending ? 'Pending completion' : 'Completed';
  const badge = (record: CreditRecord) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${!record.time_out || record.completion_pending ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{status(record)}</span>;
  if (!records.length) return null;
  return <Surface className="overflow-hidden">
    <div className="border-b border-slate-200 p-5 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-brand-900 dark:text-white">Service and merit credits</h2><span className="text-xs text-slate-500">{records.length} sessions · Newest first</span></div><p className="mt-2 text-sm text-slate-500">Completed sessions show rendered time, sanctions cleared, and earned merit. Pending sessions earn no credit.</p></div>
    <div className="hidden overflow-x-auto md:block"><table aria-label="Service and merit credits" className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr>{['Activity / session', 'Status', 'Rendered hours', 'Sanctions cleared', 'Merit earned'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{pagination.visible.map(record => <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50"><td className="max-w-sm px-5 py-4"><button type="button" aria-haspopup="dialog" onClick={() => onOpen(record.id)} className="text-left font-semibold text-brand-900 hover:underline dark:text-white">{title(record)}<span className="mt-1 block text-xs font-normal text-slate-500">{session(record)}</span><span className="mt-1 block text-xs font-normal text-slate-500">{formatManilaDateTime(record.time_in || record.recorded_at || record.event?.startTime)}</span><span className="mt-2 block text-xs text-gold-700 dark:text-gold-300">View details</span></button></td><td className="px-5 py-4">{badge(record)}</td>{fields(record).map(field => <td key={field.label} className="px-5 py-4 text-right font-mono font-semibold tabular-nums">{field.value}</td>)}</tr>)}</tbody></table></div>
    <div className="space-y-3 p-4 md:hidden">{pagination.visible.map(record => <article key={record.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div><h3 className="font-semibold text-brand-900 dark:text-white">{title(record)}</h3><p className="mt-1 text-xs text-slate-500">{session(record)} · {formatManilaDateTime(record.time_in || record.recorded_at || record.event?.startTime)}</p></div>{badge(record)}<DetailFields fields={fields(record)} /><button type="button" aria-haspopup="dialog" onClick={() => onOpen(record.id)} className="text-xs font-semibold text-gold-700 hover:underline dark:text-gold-300">View details</button></article>)}</div>
    <RecordPagination {...pagination} label="Service and merit pagination" />
  </Surface>;
}
