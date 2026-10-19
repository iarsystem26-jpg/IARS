import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function RecordPagination({ total, page, pageSize, onPage, onPageSize, label = 'Attendance pagination', customPageSize = false }: { total: number; page: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void; label?: string; customPageSize?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
    <p aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} records` : '0 records'}</p>
    <div className="flex flex-wrap items-center gap-3">{customPageSize ? <div className="flex items-center gap-2"><span>Rows per page</span><CustomSelect ariaLabel="Rows per page" className="min-w-20" options={[5,10,25,50].map(size => ({ value: String(size), label: String(size) }))} value={String(pageSize)} onChange={value => onPageSize(Number(value))} /></div> : <label className="flex items-center gap-2">Rows per page<select aria-label="Rows per page" value={pageSize} onChange={event => onPageSize(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">{[5, 10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>}
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border p-2 hover:bg-white disabled:opacity-40 dark:hover:bg-slate-800"><ChevronLeft size={16} /></button>
      <span>Page {page} of {pages}</span>
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border p-2 hover:bg-white disabled:opacity-40 dark:hover:bg-slate-800"><ChevronRight size={16} /></button>
    </div>
  </nav>;
}
