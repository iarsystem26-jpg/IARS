import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, LockKeyhole, UserRound, FileText } from 'lucide-react';
import CustomSelect from '../ui/CustomSelect';
import { buildDeletionHierarchy, selectDeletionBranch, type DeletionBranch } from '../../lib/unitDeletionHierarchy';
import { availableUnitDestinations, needsUnitTransfer, type UnitDeletionPreview } from '../../lib/unitDeletion';

export function UnitDeletionHierarchy({ preview, rootId, selected, transfers, onSelected, onTransfer, matchingKeys, filtered = false, readOnly = false, busy = false }: {
  preview: UnitDeletionPreview; rootId: string; selected: Set<string>; transfers: Record<string, string>;
  onSelected?: (selected: Set<string>) => void; onTransfer?: (key: string, destination: string) => void;
  matchingKeys?: Set<string>; filtered?: boolean; readOnly?: boolean; busy?: boolean;
}) {
  const roots = useMemo(() => buildDeletionHierarchy(preview.records, rootId), [preview.records, rootId]);
  const [expanded, setExpanded] = useState(() => new Set(roots.flatMap(branch => [branch.record.key, ...branch.children.map(child => child.record.key)])));
  const byKey = new Map(preview.records.map(record => [record.key, record]));
  const renderBranch = (branch: DeletionBranch, depth: number): React.ReactNode => {
    const { record, children } = branch;
    if (filtered && !branch.keys.some(key => matchingKeys?.has(key))) return null;
    const context = filtered && !matchingKeys?.has(record.key);
    const root = record.key === `unit:${rootId}`;
    const isUnit = record.kind === 'unit';
    const open = filtered || expanded.has(record.key);
    const move = needsUnitTransfer(record, selected);
    const action = selected.has(record.key) ? 'Delete' : move ? 'Transfer' : 'Keep';
    const selectedCount = branch.keys.filter(key => selected.has(key)).length;
    const protectedCount = branch.keys.filter(key => !byKey.get(key)?.canDelete).length;
    const full = selectedCount === branch.keys.length;
    const scope = full ? 'Entire branch selected' : protectedCount > 0 && selectedCount === branch.keys.length - protectedCount ? 'All deletable records selected' : selectedCount === 1 && selected.has(record.key) ? 'This unit only selected' : selectedCount ? 'Specific records selected' : 'Branch kept';
    const destinations = availableUnitDestinations(record, preview);
    const Icon = isUnit ? FolderTree : record.kind === 'account' ? UserRound : FileText;
    return <li key={record.key} className="min-w-0" data-record-key={record.key}>
      <div className={`min-w-0 rounded-xl border p-3 ${root ? 'border-brand-200 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-900/30' : selected.has(record.key) ? 'border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
        <div className="flex min-w-0 items-start gap-2">
          {children.length ? <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${record.name}`} aria-expanded={open} className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => setExpanded(previous => { const next = new Set(previous); open ? next.delete(record.key) : next.add(record.key); return next; })}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <Icon size={17} className="mt-2 shrink-0 text-slate-400" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex min-w-0 flex-1 items-start gap-2 py-1">
                {!readOnly && !context && <input type="checkbox" aria-label={`Delete ${record.name}${isUnit ? ' only' : ''}`} checked={selected.has(record.key)} disabled={root || !record.canDelete || busy} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-900" onChange={event => { const next = new Set(selected); event.target.checked ? next.add(record.key) : next.delete(record.key); onSelected?.(next); }} />}
                <span className="min-w-0"><span className="block break-words text-sm font-semibold text-brand-900 dark:text-white">{record.name}</span><span className="mt-1 block break-words text-xs text-slate-500">{root ? 'Unit being deleted' : record.detail.replaceAll('_', ' ')}{context && ' · Parent context'}</span></span>
              </label>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${action === 'Delete' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : action === 'Transfer' ? 'bg-gold-100 text-brand-900 dark:bg-gold-500/15 dark:text-gold-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{action}</span>
            </div>
            {children.length > 0 && <div className="mt-2 space-y-2"><p className="text-[11px] leading-5 text-slate-500"><span className={selectedCount ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>{scope}</span> · {selectedCount} of {branch.keys.length} records to delete{protectedCount > 0 && ` · ${protectedCount} protected`}</p>
              {!readOnly && !filtered && <div className="flex flex-wrap gap-x-3 gap-y-1"><button type="button" disabled={busy} className="min-h-8 text-left text-[11px] font-semibold text-rose-700 underline decoration-rose-200 underline-offset-4 dark:text-rose-300" onClick={() => onSelected?.(selectDeletionBranch(selected, branch, preview.records, true, rootId))}>Select entire branch ({branch.keys.length - protectedCount} deletable)</button><button type="button" disabled={busy} className="min-h-8 text-left text-[11px] font-semibold text-brand-900 underline decoration-slate-300 underline-offset-4 dark:text-brand-200" onClick={() => onSelected?.(selectDeletionBranch(selected, branch, preview.records, false, rootId))}>{root ? 'Keep linked records' : 'Keep this branch'}</button></div>}
            </div>}
            {record.blockedReason && <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><LockKeyhole size={12} className="mt-1 shrink-0" /><span>Protected · {record.blockedReason}</span></p>}
            {move && (readOnly ? <p className="mt-2 break-words text-xs font-semibold">Transfer to {preview.destinations.find(node => node.id === transfers[record.key])?.name || 'Destination required'}</p> : <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/40"><summary aria-label={`Set transfer destination for ${record.name}`} className="min-h-7 cursor-pointer break-words text-xs font-semibold leading-6 text-brand-900 dark:text-brand-200">{transfers[record.key] ? `Transfer to ${preview.destinations.find(node => node.id === transfers[record.key])?.name}` : 'Transfer destination required'}</summary><div className="mt-2"><CustomSelect label={`Transfer ${record.name} to`} ariaLabel={`Transfer ${record.name} to`} searchable placeholder="Choose a destination" disabled={busy} value={transfers[record.key] || ''} options={destinations.map(node => ({ value: node.id, label: `${node.name} (${node.type})` }))} onChange={value => onTransfer?.(record.key, String(value))} />{!destinations.length && <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">Create a compatible destination outside this unit before deleting it.</p>}</div></details>)}
          </div>
        </div>
      </div>
      {children.length > 0 && open && <ul className={`mt-2 space-y-2 border-l-2 border-slate-200 pl-2 dark:border-slate-700 ${depth < 4 ? 'ml-3 sm:ml-4 sm:pl-3' : 'ml-1'}`}>{children.map(child => renderBranch(child, depth + 1))}</ul>}
    </li>;
  };
  return <section aria-label={readOnly ? 'Final deletion hierarchy' : 'Deletion hierarchy'} className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-brand-900 dark:text-white"><FolderTree size={17} />{readOnly ? 'Final hierarchy plan' : 'Review by hierarchy'}</h3><div className="flex gap-3"><button type="button" className="min-h-9 text-xs font-semibold text-brand-900 dark:text-brand-200" onClick={() => setExpanded(new Set(preview.records.map(record => record.key)))}>Expand all</button><button type="button" className="min-h-9 text-xs font-semibold text-slate-500" onClick={() => setExpanded(new Set([`unit:${rootId}`]))}>Collapse all</button></div></div>
    <p className="text-xs leading-5 text-slate-500">{readOnly ? 'Expand any branch to see exactly which units and people will be deleted, transferred, or kept.' : 'Each checkbox selects one record only. Use “Select entire branch” to include its programs, year levels, classes, and deletable linked records. Protected records stay unchecked.'}</p>
    <ul className="space-y-3">{roots.map(branch => renderBranch(branch, 0))}</ul>
    {filtered && !preview.records.some(record => matchingKeys?.has(record.key)) && <p className="p-6 text-center text-sm text-slate-500">No records match your search or filter.</p>}
  </section>;
}
