import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, ExternalLink, FileText, Folder, FolderOpen, FolderPlus, HardDrive, LockKeyhole, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Surface } from '../ui/Page';
import { AppLoading, Skeleton } from '../ui/Skeleton';
import { GOOGLE_DRIVE_GAS_URL, manageDriveFolder, type DriveFolder, type DriveFolderResponse } from '../../lib/googleDrive';
import { errorMessage } from '../../lib/errors';

type FolderLocation = { data: DriveFolderResponse; path: DriveFolder[] };
type FolderDialog = { kind: 'create' } | { kind: 'rename' | 'delete'; folder: DriveFolder };

export default function AdminDriveFolders() {
  const [location, setLocation] = useState<FolderLocation>();
  const [loading, setLoading] = useState(Boolean(GOOGLE_DRIVE_GAS_URL));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<FolderDialog>();
  const [name, setName] = useState('');
  const [dialogError, setDialogError] = useState('');
  const version = useRef(0);
  const mutation = useRef(false);
  const { data, path = [] } = location || {};
  const busy = loading || saving;

  const load = useCallback(async (id?: string, ancestors: DriveFolder[] = [], setup = false) => {
    const current = ++version.current;
    setLoading(true); setError('');
    try {
      const next = await manageDriveFolder(setup ? 'setup' : 'read', id);
      if (current === version.current) { setLocation({ data: next, path: ancestors }); setSearch(''); }
    } catch (cause) {
      if (current === version.current) setError(cause instanceof Error && cause.name === 'TimeoutError' ? 'Drive is taking longer than expected. Refresh the folders to try again.' : errorMessage(cause));
    } finally { if (current === version.current) setLoading(false); }
  }, []);

  useEffect(() => {
    if (GOOGLE_DRIVE_GAS_URL) void load(undefined, [], true);
    return () => { version.current++; };
  }, [load]);

  function openDialog(next: FolderDialog) {
    setName(next.kind === 'rename' ? next.folder.name : '');
    setDialogError(''); setMessage(''); setDialog(next);
  }
  async function submit() {
    if (!data || !dialog || mutation.current) return;
    const trimmed = name.trim();
    if (dialog.kind !== 'delete' && (!trimmed || trimmed.length > 100 || /[\\/\x00-\x1f]/.test(trimmed))) {
      setDialogError('Enter a name of 1–100 characters without slashes.'); return;
    }
    mutation.current = true; setSaving(true); setDialogError('');
    try {
      if (dialog.kind === 'delete') await manageDriveFolder('delete', dialog.folder.id);
      else await manageDriveFolder(dialog.kind === 'create' ? 'create' : 'update', dialog.kind === 'create' ? data.folder.id : dialog.folder.id, trimmed);
      setDialog(undefined);
      setMessage(dialog.kind === 'delete' ? 'Folder moved to Drive trash.' : dialog.kind === 'rename' ? 'Folder renamed.' : 'Folder created.');
      await load(data.folder.id, path);
    } catch (cause) { setDialogError(errorMessage(cause)); }
    finally { mutation.current = false; setSaving(false); }
  }

  const folders = [...(data?.folders || [])].sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name));
  const visible = folders.filter(folder => folder.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  if (!GOOGLE_DRIVE_GAS_URL) return <Surface className="p-6 sm:p-8"><div className="flex items-start gap-4"><HardDrive className="shrink-0 text-slate-400" size={24} /><div><h2 className="text-lg font-bold">Drive is not connected yet</h2><p className="mt-2 text-sm leading-6 text-slate-500">Connect this educational unit's Drive service to organize uploads and manage folders.</p></div></div></Surface>;

  return <div className="min-w-0 space-y-4">
    <Surface className="overflow-hidden" aria-label="Google Drive folders">
      <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><HardDrive size={22} /></div>
          <div><h2 className="text-lg font-bold tracking-tight text-brand-900 dark:text-white">Google Drive folders</h2><p className="mt-1 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">Keep your educational unit's uploads organized in one place.</p></div>
        </div>
        <Button fullWidth={false} disabled={busy || !data} onClick={() => openDialog({ kind: 'create' })} className="w-full shrink-0 sm:w-auto"><FolderPlus size={17} />New folder</Button>
      </div>

      <div className="space-y-3 border-y border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Folder location" className="min-w-0 flex-1"><ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            {path.map((folder, index) => <li key={folder.id} className="flex min-w-0 items-center gap-1"><button type="button" disabled={busy} className="max-w-[12rem] truncate rounded-md px-2 py-1.5 font-medium text-slate-500 hover:bg-white hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => { setMessage(''); void load(folder.id, path.slice(0, index)); }}>{index === 0 ? 'Unit folders' : folder.name}</button><ChevronRight aria-hidden="true" size={14} className="shrink-0 text-slate-400" /></li>)}
            <li aria-current="page" className="flex min-w-0 items-center gap-2 py-1.5 font-semibold text-brand-900 dark:text-white"><FolderOpen aria-hidden="true" size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" /><span className="break-words">{path.length ? data?.folder.name : 'Unit folders'}</span></li>
          </ol></nav>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" fullWidth={false} disabled={busy} onClick={() => { setMessage(''); void load(data?.folder.id, path, !data); }}><RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />Refresh</Button>
            {data && <a className="app-button app-button--secondary app-button--sm inline-flex items-center gap-1.5 px-3 text-xs font-semibold" href={data.folder.url} target="_blank" rel="noreferrer">Open in Drive<ExternalLink aria-hidden="true" size={13} /><span className="sr-only"> (opens in a new tab)</span></a>}
          </div>
        </div>
        {data && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500 dark:text-slate-400">{folders.length} {folders.length === 1 ? 'folder' : 'folders'}{loading && <span role="status" className="ml-2">Refreshing...</span>}</p><label className="relative block sm:w-60"><Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" aria-label="Search folders" placeholder="Search folders" className="app-control w-full !pl-9 text-sm" value={search} onChange={event => setSearch(event.target.value)} disabled={busy} /></label></div>}
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
        {message && <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} />{message}</p>}
        {loading && !data ? <AppLoading label="Loading Drive folders" embedded><div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-4 rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><Skeleton width="2.5rem" height="2.5rem" /><Skeleton width="75%" height="1rem" /><Skeleton width="55%" height="0.75rem" /><Skeleton width="100%" height="2rem" /></div>)}</div></AppLoading>
          : data && visible.length ? <ul aria-label="Subfolders" aria-busy={loading} className="grid gap-3 sm:grid-cols-2">{visible.map(folder => <li key={folder.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-colors hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:border-emerald-700">
            <button type="button" disabled={busy} aria-label={`Open ${folder.name}`} className="group flex min-w-0 flex-1 items-start gap-3 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 sm:p-5" onClick={() => { setMessage(''); void load(folder.id, [...path, data.folder]); }}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${folder.system ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}><Folder aria-hidden="true" size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-brand-900 dark:text-white">{folder.name}</span><span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{folder.system ? 'Standard unit folder' : 'Custom folder'}</span></span><ArrowRight aria-hidden="true" size={16} className="mt-1 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/20">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{folder.system ? <><LockKeyhole size={12} />Required folder</> : 'Editable folder'}</span>
              <div className="flex items-center gap-1"><Button variant="secondary" size="sm" fullWidth={false} aria-label={`Rename ${folder.name}`} disabled={busy} onClick={() => openDialog({ kind: 'rename', folder })}><Pencil size={13} />Rename</Button>{!folder.system && <Button variant="secondary" size="sm" iconOnly aria-label={`Move ${folder.name} to trash`} title="Move to trash" className="text-red-600 dark:text-red-400" disabled={busy} onClick={() => openDialog({ kind: 'delete', folder })}><Trash2 size={14} /></Button>}</div>
            </div>
          </li>)}</ul>
            : !loading && <div className="flex flex-col items-center py-8 text-center"><FolderOpen size={32} className="mb-3 text-slate-300 dark:text-slate-600" /><h3 className="text-sm font-semibold">{!data ? 'Folders could not be loaded' : search.trim() ? 'No matching folders' : 'No subfolders yet'}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{!data ? 'Refresh to try connecting to Drive again.' : search.trim() ? 'Try a different folder name or clear your search.' : 'Open this location in Drive to view its files, or create a subfolder to organize them.'}</p>{search.trim() && <button type="button" className="mt-3 text-sm font-semibold text-brand-700 underline dark:text-brand-300" onClick={() => setSearch('')}>Clear search</button>}</div>}
      </div>
    </Surface>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200/70 p-4 dark:border-slate-800"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-slate-400" /><div><h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Private documents stay protected</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Supporting documents remain in secure storage, separate from Drive images.</p></div></div>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200/70 p-4 dark:border-slate-800"><FileText size={17} className="mt-0.5 shrink-0 text-slate-400" /><div><h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Reports download to your device</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Use the Reports folder to archive downloaded reports manually.</p></div></div>
    </div>

    <Modal open={Boolean(dialog)} onClose={() => { if (!saving) setDialog(undefined); }} title={dialog?.kind === 'delete' ? 'Move folder to trash?' : dialog?.kind === 'rename' ? 'Rename folder' : 'New folder'} description={dialog?.kind === 'delete' ? 'Only empty custom folders can be removed. School records are not deleted.' : dialog?.kind === 'rename' ? 'Update the folder name. Its files and organization stay in place.' : `Create a subfolder in ${data?.folder.name || 'this location'}.`} size="sm" closeOnBackdrop={!saving}>
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
        {dialog?.kind === 'delete' ? <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><Folder className="shrink-0 text-slate-400" size={22} /><p className="min-w-0 break-words text-sm font-semibold">{dialog.folder.name}</p></div> : <label className="block text-sm font-semibold">Folder name<input autoFocus className="input-field mt-2 w-full" value={name} onChange={event => { setName(event.target.value); setDialogError(''); }} maxLength={100} required disabled={saving} placeholder="e.g. School year 2026–2027" /><span className="mt-2 block text-xs font-normal text-slate-500">Up to 100 characters. Slashes are not allowed.</span></label>}
        {dialogError && <p role="alert" className="text-sm leading-6 text-red-600 dark:text-red-400">{dialogError}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><Button variant="secondary" fullWidth={false} disabled={saving} onClick={() => setDialog(undefined)}>Cancel</Button><Button type="submit" variant={dialog?.kind === 'delete' ? 'danger' : 'primary'} fullWidth={false} loading={saving} disabled={dialog?.kind !== 'delete' && !name.trim()}>{dialog?.kind === 'delete' ? 'Move to trash' : dialog?.kind === 'rename' ? 'Save name' : 'Create folder'}</Button></div>
      </form>
    </Modal>
  </div>;
}
