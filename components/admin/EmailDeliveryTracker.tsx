import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadEmailDeliveryStats,type EmailDeliveryStats } from '../../lib/emailDelivery';
import ErrorNotice from '../ui/ErrorNotice';
import { Activity, Clock3, Mail, Send, ShieldCheck } from 'lucide-react';
const date = (value:string|null) => value ? new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)) : 'Waiting for worker';
export default function EmailDeliveryTracker() {
 const [stats,setStats] = useState<EmailDeliveryStats|null>(null);
 const [error,setError] = useState('');
 const [now,setNow] = useState(Date.now());
 useEffect(()=>{
   let alive=true,loading=false;
   const refresh=async()=>{
    if (loading) return; loading=true;
    try { const value=await loadEmailDeliveryStats(); if(alive){setStats(value);setError('');setNow(Date.now());} }
    catch { if(alive) setError('Unable to load the email tracker. It will retry automatically.'); }
    finally {loading=false;}
   };
   void refresh();
   const poll=setInterval(()=>void refresh(),15000);
   const clock=setInterval(()=>setNow(Date.now()),1000);
   const channel=supabase.channel('superadmin-email-tracker').on('postgres_changes',{event:'*',schema:'public',table:'rmc_email_delivery_state'},()=>void refresh()).subscribe();
   return()=>{alive=false;clearInterval(poll);clearInterval(clock);void supabase.removeChannel(channel);};
 },[]);
 const reset=stats?.reset_at ? new Date(stats.reset_at).getTime() : 0;
 const sent=reset && reset<=now ? 0 : stats?.sent_count || 0;
 const remaining=Math.max(0,(stats?.safety_limit || 90)-sent-(stats?.sending || 0)-(stats?.needs_review || 0));
 const blocked=stats?.blocked_until && new Date(stats.blocked_until).getTime()>now;
 const stale=!stats?.last_heartbeat || now-new Date(stats.last_heartbeat).getTime()>180000;
 return <section aria-label="Live email quota and queue" className="email-panel space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-center gap-3"><span className="operations-icon p-2.5"><Mail size={20} aria-hidden="true" /></span><div><p className="email-eyebrow">Delivery overview</p><h3 className="text-lg font-bold">Live email quota and queue</h3></div></div>
   {stats && <span className="email-status" data-tone={blocked || !remaining || stale ? 'warning' : 'success'}><span className="email-status-dot" />{blocked || !remaining ? 'Quota paused' : stale ? 'Heartbeat delayed' : 'Worker connected'}</span>}
  </div>
  <p className="text-sm leading-6 text-[var(--color-text-muted)]">Tracks this IARS worker’s sending allowance. GmailApp does not expose Google’s exact remaining quota; other account activity can reduce capacity.</p>
  {stats && <>
   <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{label:'Sent this window',value:sent,icon:Send},{label:'Available allowance',value:remaining,icon:ShieldCheck},{label:'Queued',value:stats.queued,icon:Clock3},{label:'Sending',value:stats.sending,icon:Activity}].map(({label,value,icon:Icon})=><div key={label} className={`email-metric ${label==='Available allowance'?'email-metric--featured':''}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-5">{label}</p><Icon size={16} aria-hidden="true" className="shrink-0 opacity-70" /></div><strong className="mt-2 block text-3xl font-bold tracking-tight tabular-nums">{value}</strong></div>)}</div>
   <div className="email-quota">
    <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs font-semibold"><span>24-hour sending window</span><span className="tabular-nums">{sent} / {stats.safety_limit} recipients sent</span></div>
    <progress aria-label="Daily email allowance used" value={Math.min(sent,stats.safety_limit)} max={stats.safety_limit} className="email-quota-meter" />
    <div className="mt-3 grid gap-2 text-xs leading-5 text-[var(--color-text-muted)] sm:grid-cols-2"><p>Safety allowance: {stats.safety_limit} recipients per 24-hour window. Google’s published consumer allowance: {stats.provider_limit} recipients per day.</p><p className="sm:text-right">Next worker allowance<br/><strong className="font-semibold text-[var(--color-text)]">{date(stats.reset_at)} (Manila)</strong></p></div>
   </div>
   <p role="status" className="email-worker-note" data-tone={blocked || !remaining || stale ? 'warning' : 'success'}>{blocked || !remaining ? 'Waiting for quota. Queued requests resume automatically; fresh links are created before sending.' : stale ? 'Worker heartbeat is delayed. Requests stay queued until the worker reconnects.' : 'Worker connected. Queued requests are sent automatically.'}</p>
   <dl className="email-details grid gap-x-6 text-sm sm:grid-cols-2">{[['Duplicate requests suppressed',stats.duplicates_suppressed],['Spam requests suppressed',stats.abuse_suppressed],['Delivery needs review',stats.needs_review],['Failed requests',stats.failed],['Last worker report',date(stats.last_heartbeat)],['Oldest queued request',stats.oldest_queued_at ? date(stats.oldest_queued_at) : 'None']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   {stats.last_error && <p className="text-sm text-amber-800 dark:text-amber-200">{stats.last_error}</p>}
  </>}
  {!stats && !error && <p role="status">Loading email tracker…</p>}
  {error && <ErrorNotice error={error} operation="Load email tracker" />}
 </section>;
}
