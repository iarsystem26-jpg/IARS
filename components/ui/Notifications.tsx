import ErrorNotice from './ErrorNotice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Modal } from './Modal';
import { formatManilaDateTime } from '../../lib/dateTime';
import { loadNotifications, readNotifications, subscribeNotifications, type InboxNotice } from '../../lib/notifications';
import { toast } from '../../lib/toast';

interface NotificationsProps {
  desktopContainer?: HTMLElement | null;
  desktopCollapsed?: boolean;
}

export function Notifications({ desktopContainer, desktopCollapsed = false }: NotificationsProps) {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [inbox, setInbox] = useState<{ uid?: string; rows: InboxNotice[] }>({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const mobileBell = useRef<HTMLButtonElement>(null);
  const desktopBell = useRef<HTMLButtonElement>(null);
  const anchor = useCallback(() => window.innerWidth >= 768 ? desktopBell.current : mobileBell.current, []);
  const currentUid = useRef(uid);
  currentUid.current = uid;
  const rows = inbox.uid === uid ? inbox.rows : [];
  useEffect(() => {
    setOpen(false); setQuery(''); setLoading(true); setError(false); setSaving(false);
    if (!uid) return;
    let disposed = false, running = false, again = false;
    const started = Date.now();
    const announced = new Set<string>();
    const refresh = async () => {
      if (disposed) return;
      if (running) { again = true; return; }
      running = true;
      try {
        const next = await loadNotifications(uid);
        if (disposed) return;
        const fresh = next.filter(row => !row.read_at && Date.parse(row.created_at) >= started && !announced.has(row.id));
        fresh.forEach(row => announced.add(row.id));
        if (fresh.length === 1) toast.success(`${fresh[0].title}: ${fresh[0].detail}`);
        else if (fresh.length > 1) toast.success(`You have ${fresh.length} new notifications. Open the bell to view them.`);
        setInbox({ uid, rows: next }); setError(false);
      } catch { if (!disposed) setError(true); }
      finally {
        running = false;
        if (!disposed) { setLoading(false); if (again) { again = false; void refresh(); } }
      }
    };
    void refresh();
    const unsubscribe = subscribeNotifications(uid, () => void refresh());
    const timer = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void refresh(); }, 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus); window.addEventListener('online', onFocus);
    return () => { disposed = true; unsubscribe(); clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); };
  }, [uid]);
  const unread = rows.filter(row => !row.read_at).length;
  const filtered = rows.filter(row => `${row.title} ${row.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  const markRead = async (ids: string[]) => {
    if (!uid || saving) return false;
    setSaving(true);
    try {
      await readNotifications(uid, ids);
      if (currentUid.current !== uid) return false;
      setInbox(previous => previous.uid === uid ? { uid, rows: previous.rows.map(row => ids.includes(row.id) ? { ...row, read_at: row.read_at || new Date().toISOString() } : row) } : previous);
      return true;
    } catch { if (currentUid.current === uid) toast.error(new Error('Could not save notification read status.')); return false; }
    finally { if (currentUid.current === uid) setSaving(false); }
  };
  const trigger = (desktop: boolean) => <button type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open}
    ref={desktop ? desktopBell : mobileBell} onClick={() => setOpen(value => !value)} className={`${desktop ? `hidden md:flex w-full gap-4 rounded-xl py-3 ${desktopCollapsed ? 'justify-center px-2' : 'px-4'}` : 'inline-flex md:hidden justify-center rounded-full'} relative min-h-11 min-w-11 shrink-0 items-center text-gold-100 hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400`}>
    <span className="relative shrink-0"><Bell size={desktop ? 22 : 20} />
    {unread > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-brand-900" aria-label={`${unread} unread notifications`}>{unread > 99 ? '99+' : unread}</span>}</span>
    {desktop && !desktopCollapsed && <span className="truncate text-sm font-medium">Notifications</span>}
  </button>;
  return <>
    {trigger(false)}
    {desktopContainer ? createPortal(trigger(true), desktopContainer) : trigger(true)}
    <Modal open={open} onClose={() => setOpen(false)} title="Notifications" size="sm" anchor={anchor}
      bodyClassName="flex min-h-0 min-w-0 flex-col overflow-hidden"
      footer={<span className="text-xs text-slate-500 dark:text-slate-300">{unread} unread · {rows.length} total</span>}>
      <div className="shrink-0 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-300">Your latest updates</span>
          <button type="button" disabled={!unread || saving} onClick={() => void markRead(rows.filter(row => !row.read_at).map(row => row.id))}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand-900 hover:bg-slate-100 disabled:opacity-40 dark:text-gold-300 dark:hover:bg-slate-700"><CheckCheck size={16} />{saving ? 'Saving…' : 'Read all'}</button>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-slate-600 dark:bg-slate-900 focus-within:ring-2 focus-within:ring-gold-400">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input aria-label="Search notifications" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notifications…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-brand-900 outline-none dark:text-white" />
        </label>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4" style={{ maxHeight: 'min(55dvh, 480px)' }} aria-label="Notification list" aria-busy={loading}>
        {error && <ErrorNotice error="Unable to load the latest notifications. Reconnect to try again." />}
        {loading && !rows.length ? <p className="py-6 text-center text-sm text-slate-500">Loading notifications…</p> : filtered.length === 0 ?
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-300">{query ? 'No notifications match your search.' : "You're all caught up. No notifications yet."}</p> :
          <ul className="space-y-2">{filtered.map(row => <li key={row.id}><button type="button" disabled={saving} onClick={async () => {
            if ((row.read_at || await markRead([row.id])) && currentUid.current === uid) { setOpen(false); navigate(row.path); }
          }} className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${row.read_at ? 'border-slate-200 dark:border-slate-700' : 'border-gold-400 bg-gold-50 dark:bg-brand-900'}`}>
            <span className="flex items-start gap-2 text-sm font-bold text-brand-900 dark:text-white">{!row.read_at && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" />}<span className="break-words">{row.title}</span></span>
            <span className="mt-1 block whitespace-pre-line break-words text-xs text-slate-600 dark:text-slate-300">{row.detail}</span>
            <span className="mt-2 block text-[11px] text-slate-500 dark:text-slate-400">{formatManilaDateTime(Date.parse(row.created_at))} · {row.read_at ? 'Read' : 'Unread'}</span>
          </button></li>)}</ul>}
      </div>
    </Modal>
  </>;
}
