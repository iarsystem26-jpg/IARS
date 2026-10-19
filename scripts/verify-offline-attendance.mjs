import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const admin = client(), prefix = `offline-verify-${Date.now()}`, users=[], nodes=[], events=[], checks=[];
const password = crypto.randomBytes(24).toString('base64url');
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
const ok = async (label, request) => { const result=await request; if(result.error) throw new Error(`${label}: ${result.error.message}`); pass(label); return result.data; };
const deny = async (label, request) => { const result=await request; assert.ok(result.error, `${label} should fail`); pass(label); };
const command = async (action,args) => { const result=await admin.rpc('rmc_command',{action,args}); if(result.error) throw new Error(`${action}: ${result.error.message}`); return result.data; };
const sql = statement => {
  fs.writeFileSync('.offline-test-fixture.local',statement);
  try { execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',projectRef,'--file','.offline-test-fixture.local','--output','json'],{stdio:['ignore','pipe','pipe']}); }
  catch(error) { throw new Error(`Fixture SQL failed: ${error.stderr?.toString() || error.message}`); }
};
async function person(label,node,role='student') {
  const profile={name:`${prefix} ${label}`,username:`${prefix}-${label}`,email:`${prefix}-${label}@example.test`,student_id:testStudentId(),role,school_data:{type:'College',level:'1',section:label,academic_assignment:{campusId:`${prefix}-campus`,terminalGroupId:node,nodePathIds:[`${prefix}-campus`,node]}},...(role!=='student'?{official_data:{body:'SSG',assignment_node_id:node}}:{})};
  const result=await admin.functions.invoke('rmc-accounts',{body:{action:'create',data:{members:[{profile,password}]}}});
  if(result.error) throw new Error(`Provision ${label}: ${result.error.message}`);
  users.push(...result.data.ids); const who=client();
  const login=await who.auth.signInWithPassword({email:profile.email,password}); if(login.error) throw login.error;
  return {id:result.data.ids[0],who,profile};
}
async function event(label,extra={}) {
  const now=Date.now();
  const id=await command('createEvent',[{title:`${prefix} ${label}`,description:'Offline queue verification fixture',kind:'attendance',status:'active',startTime:now-600000,endTime:now+3600000,participantsType:'all',audienceTarget:{mode:'all'},target:{all:true},scopeNodeId:`${prefix}-campus`,geofenceEnabled:false,location:{lat:7,lng:125,radius_meters:100},penaltyValue:2,penaltyUnit:'hours',sanctionRules:{late:{value:30,unit:'minutes'},absent:{value:2,unit:'hours'}},...extra}]);
  events.push(id); return id;
}
const submission=(grant,student,extra={})=>({id:crypto.randomUUID(),sessionId:grant.id,studentUid:student.id,direction:'in',capturedAt:Math.max(Date.now(),Math.ceil(grant.preparedAt)+1),qrToken:null,manualReason:'Verified physical school ID',position:null,...extra});
const sync=(who,payload)=>who.rpc('rmc_sync_offline_attendance',{submission:payload});
try {
  const credentials=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8')).find(row=>row.role==='admin');
  const login=await admin.functions.invoke('rmc-login',{body:{identifier:credentials.username,password:credentials.password}}); if(login.error) throw login.error;
  const session=await admin.auth.setSession(login.data); if(session.error) throw session.error;
  for(const [label,parent,type] of [['campus',null,'campus'],['section','campus','section'],['other','campus','section']]) {
    const id=`${prefix}-${label}`; await command('addSchoolNode',[parent?`${prefix}-${parent}`:null,{id,name:`Offline test ${label}`,type}]); nodes.push(id);
  }
  const student=await person('student',nodes[1]); const outsider=await person('outsider',nodes[2]); const mayor=await person('mayor',nodes[1],'mayor');
  const eid=await event('roster');
  await deny('anonymous preparation denied',client().rpc('rmc_prepare_offline_attendance',{target_event_id:eid}));
  await deny('student cannot prepare an officer roster',student.who.rpc('rmc_prepare_offline_attendance',{target_event_id:eid}));
  const printed=await ok('issue printed QR for offline preparation',student.who.rpc('rmc_get_print_qr'));
  const grant=await ok('authorized scanner prepares event roster',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:eid}));
  assert.ok(grant.students.some(row=>row.uid===student.id)); assert.ok(!grant.students.some(row=>row.uid===outsider.id));
  assert.ok(grant.students.every(row=>!row.email&&!row.phone&&!row.guardian&&!row.photo_url&&['student','mayor','ssg'].includes(row.role))); pass('prepared roster is scoped and excludes contact/guardian/photo data');
  assert.ok(grant.qrHashes.some(row=>row.studentUid===student.id&&row.expiresAt===null)); assert.ok(!JSON.stringify(grant).includes(printed.token)); pass('roster contains QR hashes rather than raw passes');
  await deny('anonymous sync denied',sync(client(),submission(grant,student)));
  await deny('another account cannot use scanner grant',sync(outsider.who,submission(grant,student)));
  await deny('out-of-roster student rejected',sync(mayor.who,submission(grant,outsider)));
  await deny('capture before preparation rejected',sync(mayor.who,submission(grant,student,{capturedAt:grant.preparedAt-1000})));
  await deny('future capture rejected',sync(mayor.who,submission(grant,student,{capturedAt:Date.now()+120000})));
  await deny('manual entry without identity reason rejected',sync(mayor.who,submission(grant,student,{manualReason:''})));
  await deny('forged QR rejected',sync(mayor.who,submission(grant,student,{qrToken:`RMC1:${'a'.repeat(64)}`})));
  const payload=submission(grant,student,{qrToken:printed.token,manualReason:''});
  const concurrent=await Promise.all([sync(mayor.who,payload),sync(mayor.who,payload)]);
  assert.ok(concurrent.every(row=>!row.error)); assert.ok(concurrent.some(row=>row.data.replayed)); pass('concurrent/retried submission is committed once and replayed safely');
  assert.equal(concurrent[0].data.time_in,payload.capturedAt); assert.equal(concurrent[0].data.status,'present'); pass('saved attendance uses capture time instead of sync time');
  await deny('request identifier cannot be reused with changed payload',sync(mayor.who,{...payload,manualReason:'Different content'}));
  const attendance=await service.from('rmc_attendance').select('*').eq('event_id',eid).eq('student_id',student.id); assert.equal(attendance.data.length,1); pass('one persisted attendance row after duplicate requests');
  const audit=await service.from('rmc_audit').select('data').eq('action','attendance.offline_sync').eq('data->>request_id',payload.id);
  assert.equal(audit.data.length,1);assert.ok(!JSON.stringify(audit.data).includes(printed.token));pass('one persistent request audit survives receipt retention without raw QR data');
  const dynamic=await ok('issue a new rotating QR after preparing',student.who.rpc('rmc_issue_qr'));
  await deny('new rotating QR is not silently accepted from stale roster',sync(mayor.who,submission(grant,student,{qrToken:dynamic.token})));
  await ok('online scanner can attach a newly validated rotating QR',mayor.who.rpc('rmc_authorize_offline_qr',{offline_session_id:grant.id,qr_token:dynamic.token}));
  await ok('attached rotating QR can sync at valid capture time',sync(mayor.who,submission(grant,student,{qrToken:dynamic.token})));
  await ok('rotate printed pass',student.who.rpc('rmc_refresh_print_qr'));
  await deny('revoked printed pass requires review instead of old-roster replay',sync(mayor.who,submission(grant,student,{qrToken:printed.token})));
  const fenced=await event('GPS',{geofenceEnabled:true});
  const gpsGrant=await ok('prepare geofenced event',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:fenced}));
  await deny('offline GPS is still required',sync(mayor.who,submission(gpsGrant,student)));
  await deny('outside-event GPS rejected during sync',sync(mayor.who,submission(gpsGrant,student,{position:{latitude:0,longitude:0,accuracy:5,timestamp:Date.now()}})));
  const gpsPayload=submission(gpsGrant,student); gpsPayload.position={latitude:7,longitude:125,accuracy:5,timestamp:gpsPayload.capturedAt};
  await ok('capture GPS remains valid when submitted later',sync(mayor.who,gpsPayload));
  await command('setNodeFreezeStatus',[nodes[1],true,'Offline test freeze']);
  await deny('current scope freeze blocks new offline submissions',sync(mayor.who,submission(grant,student,{direction:'out'})));
  await command('setNodeFreezeStatus',[nodes[1],false]);
  const changed=await event('changed'), changedGrant=await ok('prepare settings-conflict event',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:changed}));
  sql(`update public.rmc_events set data=jsonb_set(data,'{description}','"Changed after preparation"'::jsonb) where id='${changed}';`);
  await deny('changed event settings require review',sync(mayor.who,submission(changedGrant,student)));
  const ended=await event('ended',{endTime:Date.now()+5000}), endGrant=await ok('prepare a closing event',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:ended}));
  const savedBeforeEnd=submission(endGrant,student);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,endGrant.captureUntil-Date.now()+100)));
  sql(`update public.rmc_events set data=data||'{"status":"done"}'::jsonb,finalized_at=now() where id='${ended}';
    insert into public.rmc_attendance(event_id,student_id,slot,data) values('${ended}','${student.id}','default','{"status":"absent","slot":"default","scanned_by_name":"System","recorded_at":1}'::jsonb);
    insert into public.rmc_sanctions(student_id,source,event_id,data) values('${student.id}','absent:${ended}:${student.id}:default','${ended}','{"change":2,"reason":"Test automatic absence"}'::jsonb);`);
  await ok('valid queued scan syncs after event finalization',sync(mayor.who,savedBeforeEnd));
  const penalty=await service.from('rmc_sanctions').select('source').eq('event_id',ended); assert.equal(penalty.data.length,0); pass('late sync replaces automatic absence and its penalty');
  const outOfOrder=submission(endGrant,student,{direction:'out',capturedAt:savedBeforeEnd.capturedAt-1});
  await deny('scan-out earlier than saved scan-in rejected',sync(mayor.who,outOfOrder));
  await ok('offline scan-out retains capture ordering',sync(mayor.who,submission(endGrant,student,{direction:'out',capturedAt:savedBeforeEnd.capturedAt+1})));
  sql(`update app_private.offline_attendance_sessions set sync_until=now()-interval '1 second' where id='${endGrant.id}';`);
  await deny('expired synchronization deadline requires review',sync(mayor.who,submission(endGrant,student,{capturedAt:savedBeforeEnd.capturedAt+2})));
  const serviceEvent=await event('offline rendered hours',{kind:'service',service:{overflow:'merit'}});
  const serviceGrant=await ok('prepare a service activity',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:serviceEvent}));
  sql(`update app_private.offline_attendance_sessions set prepared_at=now()-interval '2 minutes' where id='${serviceGrant.id}';`);
  const serviceIn=submission(serviceGrant,student,{capturedAt:Date.now()-60000});
  await ok('offline service scan-in accepted',sync(mayor.who,serviceIn));
  const serviceOut=submission(serviceGrant,student,{direction:'out',capturedAt:serviceIn.capturedAt+60000});
  const earned=await ok('offline scan-out computes captured duration',sync(mayor.who,serviceOut));
  assert.equal(earned.rendered_hours,0.016667);pass('service duration is derived from the original one-minute capture interval');
  const creditBefore=await service.from('rmc_merit_credits').select('id').eq('event_id',serviceEvent);
  await ok('service scan-out replay acknowledged',sync(mayor.who,serviceOut));
  const creditAfter=await service.from('rmc_merit_credits').select('id').eq('event_id',serviceEvent);
  assert.equal(creditAfter.data.length,creditBefore.data.length);pass('offline retry does not duplicate service merit credits');
  const fixed=await event('offline fixed merit',{kind:'merit',meritHours:1});
  const fixedGrant=await ok('prepare fixed merit activity',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:fixed}));
  await ok('fixed merit offline scan-in',sync(mayor.who,submission(fixedGrant,student)));
  const fixedReceipt=await ok('fixed merit offline scan-out',sync(mayor.who,submission(fixedGrant,student,{direction:'out'})));
  assert.equal(fixedReceipt.awarded_hours,1);pass('offline completed fixed merit retains its configured award');
  const reviewed=await event('reviewed absence'), reviewedGrant=await ok('prepare manual-review conflict event',mayor.who.rpc('rmc_prepare_offline_attendance',{target_event_id:reviewed}));
  sql(`insert into public.rmc_attendance(event_id,student_id,slot,data) values('${reviewed}','${student.id}','default','{"status":"absent","slot":"default","scanned_by_name":"Reviewing administrator"}'::jsonb);`);
  await deny('manually reviewed absence cannot be silently overwritten',sync(mayor.who,submission(reviewedGrant,student)));
  const reviewedRecord=await service.from('rmc_attendance').select('data').eq('event_id',reviewed).eq('student_id',student.id).single();
  assert.equal(reviewedRecord.data.data.status,'absent');pass('manual review is preserved after rejected offline sync');
  const factor=await ok('enroll scanner MFA',mayor.who.auth.mfa.enroll({factorType:'totp',friendlyName:'Offline verification'}));
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits=[...factor.totp.secret.replace(/=+$/,'').toUpperCase()].map(char=>alphabet.indexOf(char).toString(2).padStart(5,'0')).join('');
  const mfaKey=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=crypto.createHmac('sha1',mfaKey).update(counter).digest(),offset=digest[19]&15;
  await ok('verify scanner MFA',mayor.who.auth.mfa.challengeAndVerify({factorId:factor.id,code:String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}));
  const lowMfa=client(); await ok('scanner password-only session established',lowMfa.auth.signInWithPassword({email:mayor.profile.email,password}));
  await deny('offline preparation requires enrolled MFA',lowMfa.rpc('rmc_prepare_offline_attendance',{target_event_id:eid}));
  await deny('existing grant cannot bypass MFA during synchronization',sync(lowMfa,submission(grant,student)));
  await ok('deactivate temporary scanner',admin.functions.invoke('rmc-accounts',{body:{action:'deactivate',data:{uid:mayor.id}}}));
  await deny('deactivated scanner cannot submit existing offline grant',sync(mayor.who,submission(grant,student)));
  console.log(`Verified ${checks.length} live offline-attendance checks.`);
} finally {
  for(const table of ['rmc_excuses','rmc_sanctions','rmc_attendance','rmc_merit_credits']) if(events.length) { const result=await service.from(table).delete().in('event_id',events); if(result.error) throw result.error; }
  if(events.length) { const result=await service.from('rmc_events').delete().in('id',events); if(result.error) throw result.error; }
  for(const id of users) { await service.from('rmc_sanctions').delete().eq('student_id',id); await service.auth.admin.deleteUser(id); }
  for(const id of [...nodes].reverse()) await service.from('rmc_nodes').delete().eq('id',id);
  const targets=[...users,...events,...nodes];
  const audit=await service.from('rmc_audit').select('id,target,actor_id').gte('created_at',new Date(Number(prefix.split('-').at(-1))).toISOString());
  const auditIds=(audit.data||[]).filter(row=>users.includes(row.actor_id)||targets.includes(row.target)||row.target?.includes(prefix)).map(row=>row.id);
  if(auditIds.length) await service.from('rmc_audit').delete().in('id',auditIds);
  fs.writeFileSync('.offline-verification.local',JSON.stringify({timestamp:new Date().toISOString(),checks,cleanedUp:true},null,2));
  console.log('Removed only this run’s test records.');
}
