import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { decryptEmail } from '../_shared/emailQueue.ts';
import { prepareEmailIntent, type EmailIntent } from '../_shared/emailIntent.ts';
import { archiveEmailPreview, previewEmailIntent } from '../_shared/emailPreview.ts';

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('AUTH_EMAIL_WORKER_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response('Request too large', { status: 413 });
    const body = JSON.parse(text);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    if (body.heartbeat) {
      const result = await admin.rpc('rmc_email_worker_heartbeat',{window_start:new Date(body.heartbeat.started).toISOString(),reported_sent:body.heartbeat.sent,error_code:body.heartbeat.errorCode || null});
      if (result.error) throw result.error;
    }
    if (body.action==='heartbeat') return Response.json({recorded:true});
    if (body.action === 'claim') {
      const { data, error } = await admin.rpc('rmc_claim_auth_emails');
      if (error) throw error;
      const review = await admin.from('rmc_auth_email_queue').select('id,provider_draft_id').eq('status','uncertain').limit(10);
      if (review.error) throw review.error;
      return Response.json({ messages:data.map((row: any)=>({id:row.id,lease:row.lease_token,draftId:row.provider_draft_id})),review:review.data });
    }
    if (['prepare','draft','uncertain','cancel'].includes(body.action)) {
      const result = await admin.from('rmc_auth_email_queue').select('*').eq('id',body.id).eq('lease_token',body.lease).eq('status','pending').single();
      if (result.error || new Date(result.data.leased_until).getTime()<=Date.now()) return new Response('Lease expired',{status:409});
      if (body.action==='prepare') {
        const payload = await decryptEmail<EmailIntent | any>(result.data.payload,Deno.env.get('AUTH_EMAIL_ENCRYPTION_KEY')!);
        const message = payload.kind==='intent' ? await prepareEmailIntent(admin,payload) : payload;
        if (message && payload.kind==='intent') await archiveEmailPreview(admin,body.id,previewEmailIntent(payload));
        if (!message) {
          const update = await admin.from('rmc_auth_email_queue').update({status:'cancelled',payload:'',lease_token:null,leased_until:null}).eq('id',body.id).eq('lease_token',body.lease);
          if (update.error) throw update.error;
        }
        return Response.json({message});
      }
      let values: any;
      if (body.action==='draft' && typeof body.draftId==='string' && body.draftId.length<=150) values={provider_draft_id:body.draftId};
      else if (body.action==='uncertain') values={status:'uncertain',lease_token:null,leased_until:null,last_error:'Gmail send outcome is being reconciled; no duplicate is sent.'};
      else if (body.action==='cancel') values={status:'cancelled',payload:'',lease_token:null,leased_until:null};
      else return new Response('Invalid action',{status:400});
      const update = await admin.from('rmc_auth_email_queue').update(values).eq('id',body.id).eq('lease_token',body.lease);
      if (update.error) throw update.error;
      return Response.json({recorded:true});
    }
    if (body.action==='reconciled') {
      const result = await admin.rpc('rmc_reconcile_auth_email',{message_id:body.id,provider_id:String(body.messageId || '').slice(0,150)});
      if (result.error) throw result.error;
      return Response.json({acknowledged:result.data});
    }
    if (body.action === 'ack' && typeof body.delivered === 'boolean') {
      const { data, error } = await admin.rpc('rmc_ack_auth_email', { message_id: body.id, lease: body.lease, delivered: body.delivered });
      if (error) throw error;
      return Response.json({ acknowledged: data });
    }
    return new Response('Invalid action', { status: 400 });
  } catch { return Response.json({ error: 'Email worker request failed.' }, { status: 503 }); }
});
