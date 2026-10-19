import { errorMessage } from '../../lib/errors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Database, Zap, RefreshCw, FileText, Users, AlertTriangle, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { appData, refreshData, subscribeData } from '../../lib/backend';
import { formatManilaDateTime, formatManilaTime } from '../../lib/dateTime';
import { flushDiagnostics, getLocalDiagnostics, getReportingError, groupDiagnostics, loadSharedDiagnostics, type Diagnostic } from '../../lib/diagnostics';
import { auditCategory, readableAction } from '../../lib/healthAnalytics';
import { MetricCard } from '../ui/Page';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';

const panel = 'app-surface p-5';
const muted = 'text-sm text-[var(--color-text-muted)]';
const control = 'app-control w-full min-w-0 text-sm';
const tones: Record<string, string> = { Critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', High: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', Low: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200', Healthy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };
function Badge({ children, tone = 'Low' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.Low}`}>{children}</span>;
}

export const AdminSystemHealthView: React.FC = () => {
  const [metrics, setMetrics] = useState(appData.getSystemHealthMetrics());
  const [auditLogs, setAuditLogs] = useState(appData.getAccountAuditLogs());
  const [shared, setShared] = useState<Diagnostic[]>([]);
  const [local, setLocal] = useState(getLocalDiagnostics());
  const [loadError, setLoadError] = useState('');
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [reportingError, setReportingError] = useState(getReportingError());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [category, setCategory] = useState('All activity');
  const [errorFilter, setErrorFilter] = useState('');
  const [priority, setPriority] = useState('All priorities');
  const [errorPage, setErrorPage] = useState(1);
  const [errorPageSize, setErrorPageSize] = useState(5);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const mounted = useRef(false);
  const readCached = useCallback(() => { setMetrics(appData.getSystemHealthMetrics()); setAuditLogs(appData.getAccountAuditLogs()); setNow(Date.now()); }, []);
  const readShared = useCallback(async () => {
    try { const rows = await loadSharedDiagnostics(); if (mounted.current) { setShared(rows); setLoadError(''); setSharedLoaded(true); } }
    catch (error) { if (mounted.current) setLoadError(errorMessage((error as Error))); }
  }, []);
  const refreshHealth = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setIsRefreshing(true); setRefreshError('');
    try { await refreshData(); }
    catch { if (mounted.current) setRefreshError('The latest application data could not be loaded. Displayed record counts may be outdated.'); }
    await flushDiagnostics(); await readShared();
    if (mounted.current) { readCached(); setIsRefreshing(false); }
    busy.current = false;
  }, [readCached, readShared]);
  useEffect(() => {
    mounted.current = true; readCached(); void readShared();
    const unsubscribe = subscribeData(readCached);
    const updateErrors = () => { setLocal(getLocalDiagnostics()); setReportingError(getReportingError()); };
    window.addEventListener('rmc_diagnostics_update', updateErrors);
    const syncErrors = () => { void readShared(); };
    window.addEventListener('rmc_diagnostics_synced', syncErrors);
    const clock = window.setInterval(() => setNow(Date.now()), 5000);
    const poll = window.setInterval(() => { void readShared(); }, 30000);
    return () => { mounted.current = false; unsubscribe(); window.removeEventListener('rmc_diagnostics_update', updateErrors); window.removeEventListener('rmc_diagnostics_synced', syncErrors); clearInterval(clock); clearInterval(poll); };
  }, [readCached, readShared]);

  const issues = groupDiagnostics([...shared, ...local]);
  const affected = new Set(shared.map(row => row.reporter_id).filter(Boolean)).size;
  const urgent = issues.filter(issue => ['Critical', 'High'].includes(issue.priority)).length;
  const visibleIssues = issues.filter(issue => (priority === 'All priorities' || priority === issue.priority) && `${issue.message} ${issue.summary} ${issue.route} ${issue.details}`.toLowerCase().includes(errorFilter.toLowerCase()));
  const errorPages = Math.max(1, Math.ceil(visibleIssues.length / errorPageSize));
  const currentErrorPage = Math.min(errorPage, errorPages);
  const errorStart = (currentErrorPage - 1) * errorPageSize;
  const pagedIssues = visibleIssues.slice(errorStart, errorStart + errorPageSize);
  useEffect(() => { if (errorPage !== currentErrorPage) setErrorPage(currentErrorPage); }, [currentErrorPage, errorPage]);
  const age = metrics.lastSync ? Math.max(0, Math.floor((now - metrics.lastSync) / 1000)) : null;
  const stale = age !== null && age > 120;
  const connected = metrics.dbStatus === 'operational';
  const healthy = sharedLoaded && connected && !stale && !urgent && !loadError && !reportingError;
  const samples = metrics.latencySamples;
  const average = samples.length ? Math.round(samples.reduce((sum, row) => sum + row.ms, 0) / samples.length) : null;
  const sorted = samples.map(row => row.ms).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null;
  const attempts = metrics.syncSuccesses + metrics.syncFailures;
  const recentAudit = auditLogs.filter(log => log.timestamp >= now - 86400000);
  const filteredLogs = auditLogs.filter(log => (category === 'All activity' || auditCategory(log.action) === category) && `${readableAction(log.action)} ${log.action} ${log.actor_name || ''} ${log.target_name || log.target_uid || ''} ${log.reason || ''}`.toLowerCase().includes(logFilter.toLowerCase()));
  const inventory = [ { label: 'Accounts', value: metrics.totalUsersCount, detail: 'All visible account roles' }, { label: 'Students', value: metrics.studentsCount, detail: 'Accounts with the student role' }, { label: 'Events', value: metrics.eventsCount, detail: 'Visible scheduled and past events' }, { label: 'Attendance records', value: metrics.attendanceLogsCount, detail: 'Saved attendance entries' }, { label: 'Excuse applications', value: metrics.excuseAppsCount, detail: 'All visible application statuses' } ];
  const subsystems = [
    { title: 'Application data', status: connected ? stale ? 'Stale snapshot' : 'Last read succeeded' : 'Read unavailable', tone: connected && !stale ? 'Healthy' : 'High', desc: metrics.lastSync ? `Last successful read: ${formatManilaDateTime(metrics.lastSync)}` : 'No successful read recorded in this session.' },
    { title: 'Account context', status: metrics.activeSessions ? 'Account loaded' : 'No account loaded', tone: metrics.activeSessions ? 'Healthy' : 'Medium', desc: 'Current browser account only; other users’ live sessions are not measured.' },
    { title: 'Shared error reporting', status: loadError || reportingError ? 'Unavailable' : sharedLoaded ? 'Connected' : 'Checking…', tone: loadError || reportingError ? 'High' : sharedLoaded ? 'Healthy' : 'Low', desc: 'Signed-in browser reports; authorized staff can review failures across accounts.' },
    { title: 'QR & location checks', status: 'Checked during scans', tone: 'Low', desc: 'Token validation and device GPS are checked when scanning. No background health probe.' },
    { title: 'Security audit', status: `${auditLogs.length} entries loaded`, tone: 'Low', desc: 'Recorded account actions, separate from browser error reports.' },
    { title: 'Capacity & backups', status: 'Not measured here', tone: 'Low', desc: 'Database size, disk capacity, backup freshness and hosting uptime require the Supabase dashboard.' },
  ];

  return <div className="space-y-6 text-slate-900 dark:text-slate-100">
    <section className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
      <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="flex items-start gap-4"><div className={`rounded-2xl p-3 ${healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}><Activity size={28} /></div><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">System overview</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Health & diagnostics</h2><div className="mt-3 flex flex-wrap items-center gap-3"><Badge tone={healthy ? 'Healthy' : 'Medium'}>{healthy ? 'No urgent issues observed' : 'Needs attention'}</Badge><span className="text-xs text-slate-300">{metrics.lastSync ? `Data updated ${age! < 60 ? `${age}s` : `${Math.floor(age! / 60)}m`} ago` : 'Waiting for a successful data read'}</span></div></div></div>
        <button onClick={() => void refreshHealth()} disabled={isRefreshing} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold hover:bg-slate-700 disabled:opacity-60"><RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />{isRefreshing ? 'Refreshing…' : 'Refresh live data'}</button>
      </div>
    </section>
    {(refreshError || loadError || reportingError) && <div role="alert" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{[refreshError, loadError, reportingError].filter(Boolean).map(text => <p key={text}>{text}</p>)}</div>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={<Database size={20} className={connected ? 'text-emerald-500' : 'text-orange-500'} />} label="Data connection" value={connected ? stale ? 'Outdated' : 'Connected' : 'Degraded'} detail={connected ? 'Latest snapshot request succeeded' : 'Latest snapshot request failed or has not run'} />
      <MetricCard icon={<Zap size={20} className="text-cyan-500" />} label="Latest response time" value={metrics.lastSync ? `${metrics.latencyMs.toLocaleString()} ms` : 'Not measured'} detail={metrics.lastSync ? `${metrics.latencyMs < 500 ? 'Fast' : metrics.latencyMs < 1500 ? 'Moderate' : 'Slow'} · full application snapshot` : 'Refresh live data to measure'} />
      <MetricCard icon={<AlertTriangle size={20} className="text-orange-500" />} label="Urgent error groups" value={urgent} detail={`${issues.length} distinct issues · critical and high priority first`} />
      <MetricCard icon={<Users size={20} className="text-violet-500" />} label="Affected accounts" value={loadError ? 'Unavailable' : affected} detail="Unique reporters in the loaded 7-day sample" />
    </div>
    <div className="grid gap-6 xl:grid-cols-5">
      <section className={`${panel} xl:col-span-3`}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-bold"><Activity size={18} className="text-cyan-500" />Response-time analytics</h3><p className={`${muted} mt-1`}>Last {samples.length} successful snapshot reads in this browser session.</p></div><Badge>Milliseconds · lower is better</Badge></div>
        <div className="my-5 grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">{[['Average', average === null ? '—' : `${average} ms`], ['95th percentile', p95 === null ? '—' : `${p95} ms`], ['Read success', attempts ? `${Math.round(metrics.syncSuccesses / attempts * 100)}%` : '—']].map(([label, value]) => <div key={label} className="px-3 first:pl-0"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-lg font-bold sm:text-xl">{value}</p></div>)}</div>
        {samples.length > 1 ? <div className="h-44 w-full" role="img" aria-label={`Snapshot response times. Average ${average} milliseconds, 95th percentile ${p95} milliseconds.`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={samples} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="healthLatency" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity={.25} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={.2} /><XAxis dataKey="time" tickFormatter={value => formatManilaTime(value, { second: undefined })} tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={40} /><YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} /><Tooltip labelFormatter={value => formatManilaTime(Number(value))} formatter={value => [`${value} ms`, 'Snapshot read']} contentStyle={{ borderRadius: 12, background: '#0f172a', color: '#fff', border: '1px solid #334155' }} /><Area type="monotone" dataKey="ms" stroke="#06b6d4" strokeWidth={2} fill="url(#healthLatency)" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <div className="flex h-44 items-center justify-center rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-900">{samples.length ? 'One read recorded. Refresh live data to start a response-time trend.' : 'No measurements yet. Refresh live data to begin.'}</div>}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{metrics.syncSuccesses} successful / {metrics.syncFailures} failed reads this session. P95 is based on the displayed sample; this is not a hosting uptime measurement.</p>
      </section>
      <section className={`${panel} xl:col-span-2`}><h3 className="flex items-center gap-2 font-bold"><Database size={18} className="text-violet-500" />Application records</h3><p className={`${muted} mt-1`}>Counts from the latest authorized snapshot.</p><div className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">{inventory.map(item => <div key={item.label} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p></div><span className="text-xl font-bold tabular-nums">{item.value.toLocaleString()}</span></div>)}</div></section>
    </div>
    <section className={panel}><h3 className="font-bold">Service checks & monitoring coverage</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{subsystems.map(sub => <div key={sub.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{sub.title}</h4><Badge tone={sub.tone}>{sub.status}</Badge></div><p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{sub.desc}</p></div>)}</div></section>
    <section className={panel}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><h3 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle size={20} className="text-orange-500" />Errors across users</h3><p className={`${muted} mt-1`}>Last 7 days · up to 1,000 newest reports, plus unsent errors from this browser.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Search errors" value={errorFilter} onChange={e => { setErrorFilter(e.target.value); setErrorPage(1); }} className={control} placeholder="Search error or screen…" /><CustomSelect ariaLabel="Filter error priority" value={priority} onChange={value => { setPriority(value as string); setErrorPage(1); }} className="w-full sm:w-44" options={['All priorities', 'Critical', 'High', 'Medium', 'Low'].map(value => ({ value, label: value }))} /></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{['Critical', 'High', 'Medium', 'Low'].map(level => <Badge key={level} tone={level}>{level}: {issues.filter(row => row.priority === level).length}</Badge>)}</div>
      <p className="my-3 text-xs text-slate-500 dark:text-slate-400">Suggested urgency: Critical → High → Medium → Low; ties use affected accounts and frequency. Reports are observations, not confirmed incidents. Account counts exclude unsent reports.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[820px] text-left text-sm" aria-label="Errors ranked by fixing urgency"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr>{['Priority', 'Issue & suggested fix', 'Reports', 'Accounts', 'Last seen · Manila'].map(label => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{pagedIssues.map(issue => <tr key={issue.id} className="align-top"><td className="px-4 py-4"><Badge tone={issue.priority}>{issue.priority}</Badge></td><td className="max-w-lg px-4 py-4"><p className="font-semibold">{issue.summary}</p><p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">Screen: {issue.route.replace(/^#/, '')} · {issue.source}</p><p className="mt-2 text-xs leading-relaxed">{issue.fix}</p><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-brand-600 dark:text-cyan-400">Console error & technical details</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-slate-200">{issue.details}</pre></details></td><td className="px-4 py-4 font-semibold tabular-nums">{issue.occurrences}</td><td className="px-4 py-4 tabular-nums">{issue.users.size || 'Local only'}</td><td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">{formatManilaDateTime(issue.occurred_at)}</td></tr>)}{!visibleIssues.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{errorFilter || priority !== 'All priorities' ? 'No errors match these filters.' : loadError ? 'Shared reports unavailable. No local errors captured.' : 'No errors reported in the loaded sample.'}</td></tr>}</tbody></table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className={muted}>{visibleIssues.length ? `${errorStart + 1}-${Math.min(errorStart + errorPageSize, visibleIssues.length)}` : '0'} of {visibleIssues.length} issues</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><span>Rows per page</span><CustomSelect ariaLabel="Error rows per page" value={String(errorPageSize)} onChange={value => { setErrorPageSize(Number(value)); setErrorPage(1); }} className="w-24" options={[5, 10, 25, 50].map(size => ({ value: String(size), label: String(size) }))} /></div>
          <nav aria-label="Errors pagination" className="flex items-center gap-2">
            <Button fullWidth={false} size="sm" variant="secondary" aria-label="Previous error page" disabled={currentErrorPage === 1} onClick={() => setErrorPage(currentErrorPage - 1)}><ChevronLeft size={16} />Previous</Button>
            <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">Page {currentErrorPage} of {errorPages}</span>
            <Button fullWidth={false} size="sm" variant="secondary" aria-label="Next error page" disabled={currentErrorPage === errorPages} onClick={() => setErrorPage(currentErrorPage + 1)}>Next<ChevronRight size={16} /></Button>
          </nav>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><Info size={14} className="mt-0.5 shrink-0" />Captures console.error, uncaught errors and unhandled promise rejections after this update. Signed-in reports sync every 10 seconds; shared results refresh every 30 seconds. Request payloads are excluded and credentials are redacted.</p>
    </section>
    <section className={panel}><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><h3 className="flex items-center gap-2 text-lg font-bold"><FileText size={20} className="text-violet-500" />Security audit & activity history</h3><p className={`${muted} mt-1`}>Who did what, to which record, and when. Latest 500 authorized entries.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Search audit history" value={logFilter} onChange={e => setLogFilter(e.target.value)} placeholder="Search action, person or record…" className={control} /><CustomSelect ariaLabel="Filter audit category" value={category} onChange={value => setCategory(value as string)} className="w-full sm:w-48" options={['All activity', 'Attendance', 'Accounts & access', 'Requests & events', 'System'].map(value => ({ value, label: value }))} /></div></div>
      <div className="my-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400"><Badge>{recentAudit.length} loaded actions in the last 24 hours</Badge><Badge>{new Set(recentAudit.map(log => log.actor_uid).filter(Boolean)).size} acting accounts</Badge><Badge>{filteredLogs.length} matching entries</Badge></div>
      <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[740px] text-left text-sm" aria-label="Security audit activity"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr>{['Activity', 'Performed by', 'Affected record', 'Time · Manila'].map(label => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{filteredLogs.map(log => <tr key={log.id} className="align-top"><td className="max-w-sm px-4 py-4"><p className="font-semibold">{readableAction(log.action)}</p><div className="mt-1"><Badge>{auditCategory(log.action)}</Badge></div>{log.reason && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Reason: {log.reason}</p>}<details className="mt-2"><summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">Original action & reference</summary><p className="mt-1 break-all font-mono text-xs">{log.action} · {log.id}</p></details></td><td className="px-4 py-4">{log.actor_name || (log.actor_uid ? 'Name unavailable' : 'Not recorded')}{!log.actor_name && log.actor_uid && <p className="mt-1 max-w-40 break-all text-xs text-slate-400">{log.actor_uid}</p>}</td><td className="max-w-xs break-words px-4 py-4">{log.target_name || log.target_uid || (log.event_id ? `Event ${log.event_id}` : 'Not recorded')}{log.target_role && <p className="mt-1 text-xs text-slate-500">{log.target_role}</p>}</td><td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">{formatManilaDateTime(log.timestamp)}</td></tr>)}{!filteredLogs.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">{logFilter || category !== 'All activity' ? 'No activity matches these filters.' : 'No audit activity has been recorded.'}</td></tr>}</tbody></table></div>
    </section>
  </div>;
};
