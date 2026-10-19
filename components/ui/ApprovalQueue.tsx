import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, FileCheck2 } from 'lucide-react';
import { Collapsible } from './Collapsible';
import { Surface } from './Page';
import ApprovalStatistics from './ApprovalStatistics';
import CustomSelect from './CustomSelect';
import RecordPagination from './RecordPagination';
import { usePagination } from '../usePagination';

export const approvalControl = 'app-control w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white';
export const approvalLabel = 'mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400';
export const approvalMuted = 'text-sm text-slate-500 dark:text-slate-400';

export function ApprovalStatus({ status }: { status: string }) {
  const color = status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>{status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}</span>;
}

export interface ApprovalRow { id: string; title: string; status: string; searchText?: string; type?: string; subtitle?: string; }

export default function ApprovalQueue<T extends ApprovalRow>({ title, description, rows, onOpen, types, collapsible = false, initialStatus = 'pending', emptyMessage = 'No requests match your filters.' }: {
  title: string; description: string; rows: T[]; onOpen: (row: T) => void;
  types?: { value: string; label: string }[]; emptyMessage?: string; collapsible?: boolean; initialStatus?: 'pending' | 'all';
}) {
  const inputId = useId();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(initialStatus);
  const [type, setType] = useState('all');
  const filtered = rows.filter(row => (status === 'all' || row.status === status) && (type === 'all' || row.type === type)
    && `${row.title} ${row.searchText || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pagination = usePagination(filtered, `${search}:${status}:${type}`);
  return <>
    <ApprovalStatistics rows={rows} />
    <Surface aria-label={title} className="space-y-4 p-4 sm:p-5">
    {collapsible ? <h2><button type="button" aria-expanded={open} aria-controls={`${inputId}-panel`} onClick={() => setOpen(value => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left text-lg font-bold text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 dark:text-white"><span>{title}<span className="ml-3 inline-flex rounded-full bg-amber-100 px-2.5 py-1 align-middle text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">{rows.filter(row => row.status === 'pending').length} pending</span></span><ChevronDown size={20} className="app-disclosure-chevron shrink-0" /></button></h2> : <h2 className="text-lg font-bold text-brand-900 dark:text-white">{title}</h2>}
    <Collapsible id={`${inputId}-panel`} open={!collapsible || open} innerClassName="space-y-4">
    <p className={approvalMuted}>{description}</p>
    <div className={`grid items-end gap-3 ${types ? 'sm:grid-cols-[minmax(0,1fr)_10rem_10rem]' : 'sm:grid-cols-[minmax(0,1fr)_15rem]'}`}>
      <div><label className={approvalLabel} htmlFor={inputId}>Search requests</label><input id={inputId} className={approvalControl} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, student, or organization" /></div>
      {types && <CustomSelect label="Type" ariaLabel="Request type" value={type} onChange={value => setType(String(value))} options={[{ value: 'all', label: 'All types' }, ...types]} />}
      <CustomSelect label="Status" ariaLabel="Request status" value={status} onChange={value => setStatus(String(value))} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All statuses' }]} />
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <table aria-label={`${title} requests`} className="w-full table-fixed text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="px-4 py-3">Request</th></tr></thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{pagination.visible.map(row => <tr key={row.id}><td><button type="button" aria-label={row.title} onClick={() => onOpen(row)} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-4 text-left font-semibold text-brand-900 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 dark:text-white dark:hover:bg-slate-800"><span className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="block">{row.title}</span>{row.subtitle && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{row.subtitle}</span>}</span><ChevronRight size={18} className="shrink-0 text-slate-400" /></button></td></tr>)}
          {!pagination.total && <tr><td className="p-8 text-center"><FileCheck2 size={28} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" /><p className={approvalMuted}>{emptyMessage}</p></td></tr>}
        </tbody>
      </table>
      <RecordPagination {...pagination} customPageSize label={`${title} pagination`} />
    </div>
    </Collapsible>
  </Surface>
  </>;
}
