import { supabase, requireConfiguration } from './supabase';
export async function requestAuthEmail(action: 'confirmation' | 'recovery', email: string) {
  requireConfiguration();
  const {data,error} = await supabase.functions.invoke('rmc-email-request',{body:{action,email:email.trim().toLowerCase()}});
  if (error) {
    const details = await error.context?.json?.().catch(()=>null);
    throw new Error(details?.error || 'Email requests are temporarily unavailable. Try again later.');
  }
  if (!data?.accepted) throw new Error(data?.error || 'Unable to request email.');
  return data as {accepted:true;cooldownSeconds:number};
}
export type EmailDeliveryStats = {
 safety_limit:number;provider_limit:number;sent_count:number;queued:number;sending:number;needs_review:number;failed:number;
 reset_at:string|null;blocked_until:string|null;last_heartbeat:string|null;last_error:string|null;oldest_queued_at:string|null;
 duplicates_suppressed:number;abuse_suppressed:number;server_now:string;
};
export async function loadEmailDeliveryStats(): Promise<EmailDeliveryStats> {
 const {data,error} = await supabase.rpc('rmc_email_delivery_stats');
 if (error) throw error;
 return data;
}
export type EmailHistoryRow = {id:string;recipient:string|null;subject:string|null;kind:string;status:string;created_at:string;sent_at:string|null;available_at:string|null;leased_until:string|null;attempts:number;last_error:string|null;has_preview:boolean};
export type EmailHistoryFilters = {bucket:'sent'|'queue';query:string;action_filter:string;status_filter:string;days:number;page_number:number;page_size:number};
export type EmailAnalytics = {totals:{requested:number;sent:number;waiting:number;review:number;failed:number;cancelled:number;retried:number;average_wait_seconds:number};daily:{day:string;sent:number}[];kinds:{kind:string;count:number}[];server_now:string};
export async function loadEmailHistory(filters:EmailHistoryFilters):Promise<{rows:EmailHistoryRow[];total:number;server_now:string}> {
 const {data,error}=await supabase.rpc('rmc_email_history_list',filters);if(error) throw error;return data;
}
export async function loadEmailAnalytics(days:number):Promise<EmailAnalytics> {
 const {data,error}=await supabase.rpc('rmc_email_history_analytics',{days});if(error) throw error;return data;
}
export async function loadEmailPreview(message_id:string):Promise<{html:string|null;text:string|null;subject:string;recipient:string;status:string}> {
 const {data,error}=await supabase.rpc('rmc_email_history_preview',{message_id});if(error) throw error;return data;
}
