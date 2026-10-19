import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { loadEmailAnalytics, loadEmailHistory, loadEmailPreview, type EmailAnalytics, type EmailHistoryRow } from '../../lib/emailDelivery';
import { Modal } from '../ui/Modal';
import CustomSelect from '../ui/CustomSelect';
import Button from '../ui/Button';

const types=[{value:'',label:'All email types'},...['signup','recovery','magiclink','invite','reauthentication','email_change','other'].map(value=>({value,label:({signup:'Email confirmation',recovery:'Password reset',magiclink:'Sign-in link',invite:'Invitation',reauthentication:'Verification code',email_change:'Email change',other:'Other / legacy'} as Record<string,string>)[value]}))];
const date=(value:string|null)=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'—';
const statusLabel=(row:EmailHistoryRow)=>row.status==='pending'?(row.leased_until && new Date(row.leased_until)>new Date()?'Sending':row.attempts>0?'Waiting to retry':'Queued'):({uncertain:'Needs review',sent:'Sent',expired:'Expired',failed:'Failed',cancelled:'Cancelled'} as Record<string,string>)[row.status] || row.status;

function EmailTable({bucket,refresh,onPreview}:{bucket:'sent'|'queue';refresh:number;onPreview:(row:EmailHistoryRow)=>void}) {
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[kind,setKind]=useState(''),[status,setStatus]=useState(''),[days,setDays]=useState(0),[page,setPage]=useState(1),[size,setSize]=useState(10);
 const [rows,setRows]=useState<EmailHistoryRow[]>([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},350);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{let active=true;setBusy(true);setError('');
  loadEmailHistory({bucket,query,action_filter:kind,status_filter:status,days,page_number:page,page_size:size}).then(data=>{if(!active)return;setRows(data.rows);setTotal(data.total);const last=Math.max(1,Math.ceil(data.total/size));if(page>last)setPage(last);}).catch(()=>{if(active)setError('Unable to load email history. Try refreshing.');}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[bucket,query,kind,status,days,page,size,refresh]);
 const pages=Math.max(1,Math.ceil(total/size));
 return <section className="email-panel space-y-4" aria-label={bucket==='sent'?'Sent emails':'Email queue'}>
  <div><p className="email-eyebrow">{bucket==='sent'?'Delivery history':'Queue management'}</p><h3 className="text-lg font-bold">{bucket==='sent'?'Sent emails':'Email queue'}</h3><p className="text-sm text-[var(--color-text-muted)]">{bucket==='sent'?'Gmail has accepted these messages. This does not confirm inbox delivery or opening.':'Pending sends, retries, and delivery exceptions. Sending resumes automatically when quota is available.'}</p></div>
  <div className="email-filters grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
   <label className="block text-sm">Search recipient or subject<input type="search" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)} className="app-control mt-2 w-full rounded-xl border p-3" placeholder="Email address or subject" /></label>
   <CustomSelect label="Email type" value={kind} onChange={value=>{setKind(String(value));setPage(1);}} options={types}/>
   <CustomSelect label="Date range" value={String(days)} onChange={value=>{setDays(Number(value));setPage(1);}} options={[{value:'0',label:'All recorded history'},{value:'7',label:'Last 7 days'},{value:'30',label:'Last 30 days'},{value:'90',label:'Last 90 days'}]}/>
   {bucket==='queue'?<CustomSelect label="Queue status" value={status} onChange={value=>{setStatus(String(value));setPage(1);}} options={[{value:'',label:'All queue records'},{value:'pending',label:'Queued / sending / retrying'},{value:'uncertain',label:'Needs review'},{value:'failed',label:'Failed'},{value:'expired',label:'Expired'},{value:'cancelled',label:'Cancelled'}]}/>:<CustomSelect label="Rows per page" value={String(size)} onChange={value=>{setSize(Number(value));setPage(1);}} options={[10,25,50].map(value=>({value:String(value),label:String(value)}))}/>}
  </div>
  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  <div className="email-table-scroll overflow-x-auto" aria-busy={busy}>
   <table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">{bucket==='sent'?'Sent email history':'Current email queue and exceptions'} — all times in Manila</caption>
    <thead><tr className="border-b border-[var(--color-border)]">{['Recipient / subject','Type / status',bucket==='sent'?'Sent (Manila)':'Queued / next attempt (Manila)','Attempts','Preview'].map(label=><th key={label} className="px-3 py-3 font-bold" scope="col">{label}</th>)}</tr></thead>
    <tbody>{!error && rows.map(row=><tr key={row.id} className="border-b border-[var(--color-border)] align-top">
     <td className="max-w-72 break-words px-3 py-4"><p className="font-semibold">{row.recipient || 'Legacy recipient unavailable'}</p><p className="text-[var(--color-text-muted)]">{row.subject || 'Historical message'}</p><p className="mt-1 text-xs text-[var(--color-text-subtle)]">{row.id.slice(0,8)}</p></td>
     <td className="px-3 py-4"><p>{types.find(type=>type.value===row.kind)?.label || row.kind}</p><span className="mt-1 inline-block rounded-lg bg-[var(--color-selected)] px-2 py-1 text-xs font-semibold">{statusLabel(row)}</span>{row.last_error && <p className="mt-2 max-w-56 text-xs text-[var(--color-text-muted)]">{row.last_error}</p>}</td>
     <td className="px-3 py-4">{date(bucket==='sent'?row.sent_at:row.created_at)}{bucket==='queue' && row.status==='pending' && <p className="mt-1 text-xs text-[var(--color-text-muted)]">Eligible: {date(row.available_at)}<br/>Subject to quota and worker availability</p>}</td>
     <td className="px-3 py-4">{row.attempts}</td><td className="px-3 py-4"><button className="font-semibold text-[var(--color-selected-text)] underline disabled:opacity-50" disabled={!row.has_preview || busy} onClick={()=>onPreview(row)} aria-label={`Preview ${row.subject || 'email'} to ${row.recipient || 'legacy recipient'}`}>{row.has_preview?'Preview':'Unavailable'}</button></td>
    </tr>)}</tbody>
   </table>
   {!error && !rows.length && <p role="status" className="p-6 text-center text-sm">{busy?'Loading emails…':'No emails match these filters.'}</p>}
  </div>
  <div className="email-pagination flex flex-wrap items-center justify-between gap-3 text-xs"><p aria-live="polite">{total?`${(page-1)*size+1}–${Math.min(page*size,total)} of ${total}`:'0 emails'} · Page {page} of {pages}</p><div className="flex items-center gap-3">{bucket==='queue' && <CustomSelect ariaLabel="Queue rows per page" value={String(size)} onChange={value=>{setSize(Number(value));setPage(1);}} options={[10,25,50].map(value=>({value:String(value),label:String(value)}))}/>}<button disabled={busy || page<=1} onClick={()=>setPage(page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={busy || page>=pages} onClick={()=>setPage(page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
 </section>;
}

export default function AdminEmailDashboard() {
 const [refresh,setRefresh]=useState(0),[days,setDays]=useState(30),[analytics,setAnalytics]=useState<EmailAnalytics|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState<string|null>(null);
 const [selected,setSelected]=useState<EmailHistoryRow|null>(null),[preview,setPreview]=useState<Awaited<ReturnType<typeof loadEmailPreview>>|null>(null),[previewError,setPreviewError]=useState(''),[width,setWidth]=useState('100%');
 const previewSequence=useRef(0);
 useEffect(()=>{const timer=setInterval(()=>setRefresh(value=>value+1),15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{let active=true;loadEmailAnalytics(days).then(data=>{if(active){setAnalytics(data);setError('');setUpdated(data.server_now);}}).catch(()=>{if(active)setError('Unable to load email analytics.');});return()=>{active=false;};},[days,refresh]);
 const showPreview=async(row:EmailHistoryRow)=>{const sequence=++previewSequence.current;setSelected(row);setPreview(null);setPreviewError('');try{const data=await loadEmailPreview(row.id);if(sequence===previewSequence.current)setPreview(data);}catch{if(sequence===previewSequence.current)setPreviewError('Unable to load this preview.');}};
 return <div className="space-y-5">
  <div className="email-panel flex flex-wrap items-center justify-between gap-3"><div><p className="email-eyebrow">Activity & history</p><h2 className="text-xl font-bold">Email activity</h2><p className="text-sm text-[var(--color-text-muted)]">Updates every 15 seconds. Last updated: {date(updated)}</p></div><Button fullWidth={false} onClick={()=>setRefresh(value=>value+1)}>Refresh activity</Button></div>
  <section className="email-panel space-y-4" aria-label="Email analytics"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Delivery analytics</h3><CustomSelect ariaLabel="Analytics period" value={String(days)} onChange={value=>setDays(Number(value))} options={[7,30,90].map(value=>({value:String(value),label:`Last ${value} days`}))}/></div>
   {error && <p role="alert">{error}</p>}
   {analytics && <><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[['Recorded requests',analytics.totals.requested],['Sent',analytics.totals.sent],['Waiting / review',`${analytics.totals.waiting} / ${analytics.totals.review}`],['Failed / expired',analytics.totals.failed],['Retried',analytics.totals.retried],['Cancelled',analytics.totals.cancelled],['Average send wait',`${Math.round(analytics.totals.average_wait_seconds/60)} min`],['Completion rate',`${analytics.totals.requested?Math.round(100*analytics.totals.sent/analytics.totals.requested):0}%`]].map(([label,value])=><div key={label} className="email-metric"><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p></div>)}</div>
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 sm:p-4"><p className="mb-3 text-sm font-semibold">Daily sent volume · Manila</p><div className="h-56" role="img" aria-label={`Daily sent volume for the last ${days} days`}><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.daily}><XAxis tick={{fill:'var(--color-text-muted)',fontSize:11}} axisLine={false} tickLine={false} dataKey="day" tickFormatter={value=>value.slice(5)} minTickGap={30}/><YAxis width={32} tick={{fill:'var(--color-text-muted)',fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip contentStyle={{background:'var(--color-surface)',borderColor:'var(--color-border)',borderRadius:12,color:'var(--color-text)'}} cursor={{fill:'var(--color-selected)'}}/><Bar dataKey="sent" name="Sent" fill="var(--color-brand)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div><p className="text-sm">{analytics.kinds.map(item=>`${types.find(type=>type.value===item.kind)?.label || item.kind}: ${item.count}`).join(' · ') || 'No recorded requests in this period.'}</p></div></>}
   <p className="text-xs text-[var(--color-text-muted)]">Analytics count queued requests, including retries and exceptions. Suppressed requests appear in the quota tracker. Sent means accepted by Gmail; inbox delivery and open tracking are unavailable.</p>
  </section>
  <EmailTable bucket="queue" refresh={refresh} onPreview={row=>void showPreview(row)}/>
  <EmailTable bucket="sent" refresh={refresh} onPreview={row=>void showPreview(row)}/>
  <p className="text-xs text-[var(--color-text-muted)]">History is retained separately from temporary queue payloads. Older emails sent before preview archiving may have unavailable previews. Queue previews show the planned message; a fresh authentication link is generated at sending time.</p>
  <Modal open={!!selected} onClose={()=>{previewSequence.current++;setSelected(null);setPreview(null);}} title="Email preview" size="xl">
   <div className="space-y-4"><p className="break-words"><strong>{preview?.subject || selected?.subject}</strong><br/>{preview?.recipient || selected?.recipient}</p><p className="text-sm">Authentication links and codes are hidden. Preview buttons cannot perform account actions.</p><CustomSelect label="Preview screen width" value={width} onChange={value=>setWidth(String(value))} options={[{value:'100%',label:'Fit available width'},{value:'320px',label:'Small phone · 320 px'},{value:'390px',label:'Phone · 390 px'},{value:'768px',label:'Tablet · 768 px'}]}/>{previewError && <p role="alert">{previewError}</p>}{!preview && !previewError && <p role="status">Loading preview…</p>}{preview?.html?<div className="overflow-x-auto rounded-xl bg-slate-100 p-2"><iframe title="Safe email layout preview" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} style={{width,maxWidth:'none',height:650,margin:'0 auto',display:'block',border:0}}/></div>:preview && <p>Preview was not archived for this email.</p>}<details><summary className="cursor-pointer text-sm font-semibold">Plain text version</summary><pre className="mt-2 whitespace-pre-wrap break-words text-sm">{preview?.text}</pre></details></div>
  </Modal>
 </div>;
}
