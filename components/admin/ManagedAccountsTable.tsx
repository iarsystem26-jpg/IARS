import ErrorNotice from '../ui/ErrorNotice';
import { formatManilaDateTime } from '../../lib/dateTime';
import { SelectField } from '../ui/SelectField';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from 'lucide-react';
import ProfileAvatar from '../ui/ProfileAvatar';
import { UserProfile } from '../../types';
import { managedAccountRoles } from '../../lib/accountProvisioning';
import { roleLabels } from '../../lib/accessControl';
import Button from '../ui/Button';
import SearchInput from '../ui/SearchInput';

export type AccountAccessInfo = { last_sign_in_at?: string | null; created_at?: string };
interface Props {
  accounts: UserProfile[];
  access: Record<string, AccountAccessInfo>;
  loading: boolean;
  accessError: string;
  onRefresh: () => void;
  onSelect: (account: UserProfile) => void;
}
const roleLabel = (role: string) => managedAccountRoles.find(item => item.id === role)?.label || roleLabels[role] || role;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bossa\b/g, 'osas');

export default function ManagedAccountsTable({ accounts, access, loading, accessError, onRefresh, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [activity, setActivity] = useState('all');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tokens = normalize(search).split(/\s+/).filter(Boolean);
  const activityFor = (uid: string) => !access[uid] ? 'unknown' : access[uid].last_sign_in_at ? 'accessed' : 'never';
  const filtered = accounts.filter(account => {
    if (role !== 'all' && account.role !== role) return false;
    if (activity !== 'all' && activityFor(account.uid) !== activity) return false;
    const haystack = normalize([account.name, account.email, account.username, account.student_id,
      account.role, roleLabel(account.role), account.official_data?.position, account.official_data?.scope,
      account.school_data?.department, account.school_data?.section].filter(Boolean).join(' '));
    return tokens.every(token => haystack.includes(token));
  }).sort((a, b) => {
    if (sort === 'recent') {
      const difference = (Date.parse(access[b.uid]?.last_sign_in_at || '') || 0) - (Date.parse(access[a.uid]?.last_sign_in_at || '') || 0);
      if (difference) return difference;
    }
    const difference = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    return (sort === 'name-desc' ? -difference : difference) || a.uid.localeCompare(b.uid);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const roleOptions = [...new Set([...managedAccountRoles.map(item => item.id), ...accounts.map(account => account.role)])];
  const hasFilters = Boolean(search || role !== 'all' || activity !== 'all');
  const clearFilters = () => { setSearch(''); setRole('all'); setActivity('all'); setPage(1); };
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [currentPage, page]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [currentPage, pageSize, search, role, activity, sort]);

  return <section aria-label="Managed accounts directory" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
    <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput className="flex-1" ariaLabel="Search managed accounts" placeholder="Search name, email, username, ID, role, or unit…" value={search} onChange={value => { setSearch(value); setPage(1); }} />
        <Button className="sm:w-auto" variant="secondary" loading={loading} onClick={onRefresh}><RefreshCw size={15} /> Refresh access status</Button>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Role
          <SelectField aria-label="Role" className="mt-1 min-w-0" value={role} onChange={e => { setRole(e); setPage(1); }}>
            <option value="all">All roles</option>{roleOptions.map(value => <option key={value} value={value}>{roleLabel(value)}</option>)}
          </SelectField>
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Sign-in activity
          <SelectField aria-label="Sign-in activity" className="mt-1 min-w-0" value={activity} onChange={e => { setActivity(e); setPage(1); }}>
            <option value="all">All activity</option><option value="accessed">Has signed in</option><option value="never">Never signed in</option><option value="unknown">Status unavailable</option>
          </SelectField>
        </label>
        <label className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Sort by
          <SelectField aria-label="Sort by" className="mt-1 min-w-0" value={sort} onChange={e => { setSort(e); setPage(1); }}>
            <option value="name">Name: A–Z</option><option value="name-desc">Name: Z–A</option><option value="recent">Most recent sign-in</option>
          </SelectField>
        </label>
        {hasFilters && <Button variant="secondary" className="sm:w-auto" onClick={clearFilters}>Clear filters</Button>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Combine search words in any order, such as “OSAS Santos”.</p>
      {accessError && <ErrorNotice error={accessError} operation="Managed Accounts Table">Use Refresh access status to retry.</ErrorNotice>}
    </div>
    <div ref={scrollRef} role="region" aria-label="Scrollable accounts table" tabIndex={0} className="max-h-[420px] overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500" style={{ scrollbarGutter: 'stable' }}>
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">Managed accounts with role, sign-in activity, and profile actions</caption>
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>{['Account', 'Role', 'Access', 'Actions'].map(title => <th scope="col" key={title} className={`border-b border-slate-200 px-4 py-3 dark:border-slate-700 ${title === 'Actions' ? 'text-right' : ''}`}>{title}</th>)}</tr>
        </thead>
        <tbody>{visible.map(account => <tr key={account.uid} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
          <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-3"><ProfileAvatar src={account.photo_url} alt={`${account.name}'s profile photo`} className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-brand-100 object-cover dark:border-slate-700" />
              <div className="min-w-0 max-w-sm"><div className="break-words font-bold text-slate-900 dark:text-white">{account.name}</div><div className="break-all text-xs text-slate-500">@{account.username} · {account.email}</div>{account.student_id && <div className="text-xs text-slate-500">ID: {account.student_id}</div>}</div>
            </div>
          </td>
          <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-700"><span className="inline-block whitespace-nowrap rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-brand-900 dark:bg-gold-500/15 dark:text-gold-300">{roleLabel(account.role)}</span></td>
          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 dark:border-slate-700">{access[account.uid]?.last_sign_in_at ? <span className="text-emerald-700 dark:text-emerald-300">{formatManilaDateTime(access[account.uid].last_sign_in_at!)}</span> : <span className="text-slate-500">{access[account.uid] ? 'Never signed in' : loading ? 'Loading…' : 'Status unavailable'}</span>}</td>
          <td className="border-b border-slate-100 px-4 py-3 text-right dark:border-slate-700"><Button className="w-auto" variant="secondary" aria-label={`View profile for ${account.name}`} onClick={() => onSelect(account)}><Eye size={15} /> View profile</Button></td>
        </tr>)}{!visible.length && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500">{accounts.length ? 'No accounts match your search and filters.' : 'No managed accounts yet.'}</td></tr>}</tbody>
      </table>
    </div>
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)}` : '0'} of {filtered.length} accounts{hasFilters ? ` (${accounts.length} total)` : ''}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">Rows per page<SelectField aria-label="Rows per page" className="mt-1 min-w-0" value={pageSize} onChange={e => { setPageSize(Number(e)); setPage(1); }}>{[5, 10, 25, 50].map(size => <option key={size}>{size}</option>)}</SelectField></label>
        <nav aria-label="Accounts pagination" className="flex items-center gap-2">
          <Button iconOnly className="w-8" size="sm" variant="secondary" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></Button>
          <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">Page {currentPage} of {totalPages}</span>
          <Button iconOnly className="w-8" size="sm" variant="secondary" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></Button>
        </nav>
      </div>
    </div>
  </section>;
}
