import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');process.loadEnvFile('.env.server.local');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4175';
const url=process.env.SUPABASE_URL, options={auth:{persistSession:false,autoRefreshToken:false}};
const accounts=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8'));
let account; const adminAccount=accounts.find(row=>row.role==='admin');
const client=()=>createClient(url,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const admin=client(),mayor=client(),service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const checks=[],prefix=`offline-browser-${Date.now()}`,fixtureUsers=[],fixtureNodes=[];let browser,eventId,photoPath;
const eventTitle=`${prefix} Offline Assembly`;
const pass=label=>{checks.push(label);console.log(`PASS ${label}`);};
async function login(who,credentials){const result=await who.functions.invoke('rmc-login',{body:{identifier:credentials.username,password:credentials.password}});if(result.error)throw result.error;const session=await who.auth.setSession(result.data);if(session.error)throw session.error;}
try {
  await login(admin,adminAccount);
  const password=crypto.randomBytes(24).toString('base64url');
  for(const [label,parent,type] of [['campus',null,'campus'],['section','campus','section']]) {
    const id=`${prefix}-${label}`;const result=await admin.rpc('rmc_command',{action:'addSchoolNode',args:[parent?`${prefix}-${parent}`:null,{id,name:`Browser fixture ${label}`,type}]});if(result.error)throw result.error;fixtureNodes.push(id);
  }
  for(const role of ['student','mayor']) {
    const profile={name:`${prefix} ${role}`,username:`${prefix}-${role}`,email:`${prefix}-${role}@example.test`,student_id:testStudentId(),role,school_data:{type:'College',level:'1',section:'Browser fixture',academic_assignment:{campusId:fixtureNodes[0],terminalGroupId:fixtureNodes[1],nodePathIds:fixtureNodes}},...(role==='mayor'?{official_data:{body:'SSG',assignment_node_id:fixtureNodes[1]}}:{})};
    const result=await admin.functions.invoke('rmc-accounts',{body:{action:'create',data:{members:[{profile,password}]}}});if(result.error)throw result.error;fixtureUsers.push(...result.data.ids);
    if(role==='mayor')account={username:profile.username,password};
  }
  await login(mayor,account);
  const snapshot=await mayor.rpc('rmc_snapshot');if(snapshot.error)throw snapshot.error;
  const {data:{session}}=await mayor.auth.getSession();
  const profile=snapshot.data.profiles.find(row=>row.uid===session.user.id);
  const student=snapshot.data.profiles.find(row=>row.role==='student'&&row.account_status==='active');
  assert.ok(student,'Need a scoped student in the browser verification account');
  photoPath=`${student.uid}/photo/${prefix}.png`;
  const photoBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS9sAAAAASUVORK5CYII=','base64');
  const uploaded=await service.storage.from('rmc-documents').upload(photoPath,photoBytes,{contentType:'image/png'});if(uploaded.error)throw uploaded.error;
  const saved=await service.from('rmc_profiles').select('profile').eq('id',student.uid).single();if(saved.error)throw saved.error;
  const changed=await service.from('rmc_profiles').update({profile:{...saved.data.profile,photo_url:`storage://rmc-documents/${photoPath}`}}).eq('id',student.uid);if(changed.error)throw changed.error;
  const node=profile.official_data?.assignment_node_id||profile.school_data?.academic_assignment?.terminalGroupId;
  const now=Date.now();
  const created=await admin.rpc('rmc_command',{action:'createEvent',args:[{title:eventTitle,description:'Offline browser verification',kind:'attendance',status:'active',startTime:now-300000,endTime:now+3600000,scopeNodeId:node,participantsType:'all',audienceTarget:{mode:'all'},target:{all:true},penaltyValue:2,penaltyUnit:'hours',sanctionRules:{late:{value:30,unit:'minutes'},absent:{value:2,unit:'hours'}},geofenceEnabled:false,location:{lat:7,lng:125,radius_meters:100}}]});
  if(created.error)throw created.error;eventId=created.data;
  console.log('Prepared isolated browser fixtures; checking automatic roster preparation.');
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  const page=await browser.newPage();await page.setViewport({width:375,height:812});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.text().startsWith('Automatic'))console.log(message.text());});
  const click=async label=>{
    try { await page.waitForFunction(text=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()===text&&!button.disabled),{},label); }
    catch(error){fs.writeFileSync('.offline-browser-state.local',await page.$eval('body',element=>element.innerText));throw error;}
    await page.evaluate(text=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===text&&!button.disabled).click(),label);
  };
  await page.goto(`${base}/#/login`,{waitUntil:'networkidle0'});
  await page.waitForSelector('#landing-login-identifier');
  await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.active),{timeout:45000});
  await page.reload({waitUntil:'networkidle0'});
  await page.type('#landing-login-identifier',account.username);await page.type('#landing-login-password',account.password);
  await page.$eval('#landing-login-password',input=>input.closest('form').requestSubmit());
  try { await page.waitForFunction(()=>location.hash==='#/dashboard',{timeout:45000}); }
  catch(error){fs.writeFileSync('.offline-browser-state.local',await page.$eval('body',element=>element.innerText));throw error;}
  await page.waitForFunction(async()=>{
    if(!(await indexedDB.databases()).some(database=>database.name==='rmc-offline-attendance-v1'))return false;
    return new Promise(resolve=>{
    const request=indexedDB.open('rmc-offline-attendance-v1');
    request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('records')){db.close();resolve(false);return;}const read=db.transaction('records').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result.some(row=>row.kind==='roster'));db.close();};};
    request.onerror=()=>resolve(false);
    });
  },{timeout:45000});
  pass('login automatically prepares scoped rosters without opening the scanner');
  await page.waitForFunction(async()=>new Promise(resolve=>{
    const request=indexedDB.open('rmc-offline-attendance-v1');
    request.onsuccess=()=>{const db=request.result;const read=db.transaction('records').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result.some(row=>row.kind==='photo'));db.close();};};
  }),{timeout:45000});
  pass('authorized profile thumbnail is prefetched into encrypted device storage');
  student.name=`${student.name} updated`;student.student_id=`${prefix}-updated-id`;
  const refreshedProfile=await service.from('rmc_profiles').select('profile').eq('id',student.uid).single();if(refreshedProfile.error)throw refreshedProfile.error;
  const profileUpdate=await service.from('rmc_profiles').update({profile:{...refreshedProfile.data.profile,name:student.name,student_id:student.student_id}}).eq('id',student.uid);if(profileUpdate.error)throw profileUpdate.error;
  await page.waitForFunction(async expected=>new Promise(resolve=>{
    const request=indexedDB.open('rmc-offline-attendance-v1');
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(['keys','records']),rows=tx.objectStore('records').getAll(),key=tx.objectStore('keys').get(expected.owner);
      tx.oncomplete=()=>{db.close();void Promise.all(rows.result.filter(row=>row.kind==='roster').map(async row=>{
        const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(`${row.owner}:${row.kind}:${row.id}`)},key.result,row.cipher);
        return JSON.parse(new TextDecoder().decode(plain));
      })).then(rosters=>resolve(rosters.some(roster=>roster.students.some(student=>student.uid===expected.uid&&student.name===expected.name&&student.student_id===expected.id)))).catch(()=>resolve(false));};
    };
  }),{timeout:45000},{owner:profile.uid,uid:student.uid,name:student.name,id:student.student_id});
  pass('background snapshot updates encrypted local names and IDs without manual roster refresh');
  await page.evaluate(()=>location.hash='/mayor/scan');
  await page.waitForFunction(title=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes(title)),{timeout:45000},eventTitle);
  await page.evaluate(title=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes(title)).click(),eventTitle);
  await page.waitForFunction(()=>document.body.textContent.includes('students saved on this device'),{timeout:30000});
  const encrypted=await page.evaluate(async()=>new Promise(resolve=>{
    const request=indexedDB.open('rmc-offline-attendance-v1');
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['keys','records']);const records=tx.objectStore('records').getAll(),key=tx.objectStore('keys').get('active-owner');tx.oncomplete=()=>{resolve({rows:records.result.map(row=>({kind:row.kind,cipherBytes:row.cipher.byteLength,plain:JSON.stringify(row)})),owner:key.result});db.close();};};
  }));
  assert.ok(encrypted.rows.every(row=>row.cipherBytes>16&&!row.plain.includes(student.name)&&!row.plain.includes(student.student_id)));
  assert.equal(encrypted.owner,profile.uid);
  pass('automatic rosters are encrypted and scoped to the signed-in scanner');
  await click('Close');
  const cdp=await page.createCDPSession();
  await page.setOfflineMode(true);await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(title=>document.body.textContent.includes(title)&&!document.body.textContent.includes('Loading your workspace'),{timeout:30000},eventTitle);
  assert.equal(await page.evaluate(()=>location.hash),'#/mayor/scan');
  pass('prepared scanner and event survive a cold page reload without internet');
  await page.evaluate(title=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes(title)).click(),eventTitle);
  await click('Start scanning');
  await page.waitForSelector('#manual-student-id');await page.type('#manual-student-id',student.student_id);
  await click('Check student');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog=>dialog.textContent.includes('Verify student identity')));
  assert.ok(await page.evaluate(name=>document.querySelector('[role="dialog"]').textContent.includes(name),student.name));
  pass('exact student ID resolves against downloaded roster while offline');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="dialog"] img')).some(img=>img.src.startsWith('data:image/')&&img.complete&&img.naturalWidth>0),{timeout:15000});
  pass('encrypted profile picture displays after offline cold reload without external requests');
  const manualInput=await page.$('[role="dialog"] input');await manualInput.type('Verified physical school ID offline');
  await click('Record');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog=>dialog.textContent.includes('Saved on this device')));
  assert.ok(await page.evaluate(()=>document.querySelector('[role="dialog"]').textContent.includes('Pending sync')));
  pass('offline attendance is saved locally and shown as pending rather than confirmed');
  const beforeSync=await service.from('rmc_attendance').select('*').eq('event_id',eventId).eq('student_id',student.uid);
  assert.equal(beforeSync.data.length,0);pass('offline capture has not been falsely recorded on the server');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.textContent.includes('1 pending sync'),{timeout:30000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  pass('pending attendance survives another cold reload and fits a phone viewport');
  await page.evaluate(()=>{
    const storageKey=Object.keys(localStorage).find(key=>key.endsWith('-auth-token'));
    if(!storageKey)throw new Error('Saved Auth session was not found');
    const saved=JSON.parse(localStorage.getItem(storageKey));saved.expires_at=Math.floor(Date.now()/1000)-3600;saved.expires_in=0;
    localStorage.setItem(storageKey,JSON.stringify(saved));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.textContent.includes('1 pending sync')&&!document.body.textContent.includes('Loading your workspace'),{timeout:30000});
  assert.equal(await page.evaluate(()=>location.hash),'#/mayor/scan');
  pass('prepared scanner remains available when an expired Auth session cannot refresh offline');
  await page.setOfflineMode(false);await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await page.waitForFunction(()=>document.body.textContent.includes('1 confirmed'),{timeout:60000});
  const afterSync=await service.from('rmc_attendance').select('*').eq('event_id',eventId).eq('student_id',student.uid);
  assert.equal(afterSync.data.length,1);assert.equal(afterSync.data[0].data.method,'offline_manual');
  pass('reconnecting automatically syncs the queued capture once with offline audit metadata');
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.textContent.includes('1 confirmed'),{timeout:30000});
  const afterReload=await service.from('rmc_attendance').select('*').eq('event_id',eventId).eq('student_id',student.uid);
  assert.equal(afterReload.data.length,1);assert.deepEqual(errors,[]);
  pass('confirmed receipt survives reload without duplicate attendance or JavaScript errors');
  await page.evaluate(()=>location.hash='/student/profile');
  await page.waitForSelector('[aria-label="Sign out of portal"]',{timeout:30000});
  await page.$eval('[aria-label="Sign out of portal"]',button=>button.click());
  try { await page.waitForFunction(()=>location.hash==='#/login',{timeout:30000}); }
  catch(error){fs.writeFileSync('.offline-browser-state.local',await page.$eval('body',element=>element.innerText));throw error;}
  await page.waitForFunction(async()=>new Promise(resolve=>{
    const request=indexedDB.open('rmc-offline-attendance-v1');
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['keys','records']);const records=tx.objectStore('records').getAll(),owner=tx.objectStore('keys').get('active-owner');tx.oncomplete=()=>{resolve(!records.result.some(row=>row.kind==='roster'||row.kind==='photo')&&!owner.result);db.close();};};
  }),{timeout:30000});
  assert.deepEqual(errors,[]);
  pass('logout clears encrypted rosters, photos, and the offline restoration marker');
  console.log(`Verified ${checks.length} offline attendance browser checks.`);
} finally {
  await browser?.close();
  if(photoPath)await service.storage.from('rmc-documents').remove([photoPath]);
  if(eventId){for(const table of ['rmc_excuses','rmc_sanctions','rmc_attendance','rmc_merit_credits'])await service.from(table).delete().eq('event_id',eventId);await service.from('rmc_events').delete().eq('id',eventId);await service.from('rmc_audit').delete().eq('target',eventId);}
  for(const id of fixtureUsers){await service.from('rmc_sanctions').delete().eq('student_id',id);await service.from('rmc_audit').delete().eq('actor_id',id);await service.from('rmc_audit').delete().eq('target',id);await service.auth.admin.deleteUser(id);}
  for(const id of [...fixtureNodes].reverse()){await service.from('rmc_nodes').delete().eq('id',id);await service.from('rmc_audit').delete().eq('target',id);}
  fs.writeFileSync('.offline-browser-verification.local',JSON.stringify({timestamp:new Date().toISOString(),checks,cleanedUp:true},null,2));
  console.log('Removed the browser verification event and its records.');
}
