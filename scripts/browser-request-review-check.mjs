import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const student = checked(await service.from('rmc_profiles').select('*').eq('is_test_account',true).eq('role_id','student').single());
const officer = checked(await service.from('rmc_profiles').select('node_id').eq('is_test_account',true).eq('role_id','ossa').single());
const applications = checked(await service.from('rmc_applications').select('id,data').eq('id',student.id));
const ids = Array.from({length:12}, () => randomUUID());
let browser; let page; let patched = false;
fs.mkdirSync('artifacts/request-review', {recursive:true});
try {
 const pending = checked(await service.from('rmc_profile_requests').select('id').eq('student_id',student.id).eq('status','pending'));
 assert.equal(pending.length,0,'The demo account must not have a real pending request');
 const baseline = {...student.profile,phone:'0917 000 0000',guardian:{...student.profile.guardian,name:'Original Guardian'}};
 checked(await service.from('rmc_profiles').update({profile:baseline,node_id:officer.node_id}).eq('id',student.id)); patched = true;
 checked(await service.from('rmc_profile_requests').insert(ids.map((id,i) => ({id,student_id:student.id,student_name:`Review sample ${i}`,student_number:'2026-00001A',kind:'edit',reason:'Please correct my phone and guardian information.',changes:{phone:'0999 111 2222',guardianName:'Corrected Guardian'},original:{phone:baseline.phone,guardianName:'Original Guardian'},status:i===0?'pending':'approved',field_decisions:i===0?{}:{phone:{status:'approved'},guardianName:{status:'approved'}},created_at:new Date(Date.now()-i*1000).toISOString()}))));
 browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 page = await browser.newPage(); const errors=[]; page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
 const base=process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
 const account=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8')).find(row=>row.role==='ossa');
 await page.goto(`${base}/#/login`,{waitUntil:'networkidle0'}); await page.waitForSelector('#landing-login-identifier');
 await page.type('#landing-login-identifier',account.username); await page.type('#landing-login-password',account.password);
 await page.$eval('#landing-login-password',input=>input.closest('form').requestSubmit());
 await page.waitForFunction(()=>location.hash!=='#/login' && document.querySelector('main'),{timeout:40000});
 await page.goto(`${base}/#/ossa/dashboard/requests`,{waitUntil:'networkidle0'});
 await page.waitForSelector('table[aria-label="Information request table"] tbody button');
 for(const width of [1440,375]) {
  await page.setViewport({width,height:900});
  await page.$eval('[aria-label="Request status"]',el=>el.click());
  await page.waitForSelector('[role="option"]');
  await page.evaluate(()=>[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()==='All requests').click());
  await page.waitForFunction(()=>document.querySelectorAll('table tbody button').length===10);
  assert.equal(await page.$('main select'),null,'All dropdowns must use CustomSelect');
  assert.equal(await page.$$eval('nav[aria-label="OSSA Hub pages"] a',links=>links.length),1);
  await page.screenshot({path:'artifacts/request-review/before-pagination.png',fullPage:true});
  await page.$eval('[aria-label="Next page"]',el=>el.click());
  await page.waitForFunction(()=>document.querySelectorAll('table tbody button').length===2);
  await page.$eval('[aria-label="Previous page"]',el=>el.click());
  await page.waitForFunction(()=>document.querySelectorAll('table tbody button').length===10);
  assert.equal(await page.$eval('table',el=>el.textContent.includes('0917 000 0000')),false,'Comparisons must remain in modal');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:`artifacts/request-review/table-${width}.png`,fullPage:true});
  await page.evaluate(()=>[...document.querySelectorAll('table tbody button')].find(el=>el.textContent.includes('Review sample 0')).click());
  await page.waitForSelector('[role="dialog"]');
  assert.ok(await page.$eval('[role="dialog"]',el=>el.textContent.includes('0917 000 0000') && el.textContent.includes('0999 111 2222')));
  assert.equal(await page.$eval('[role="dialog"]',el=>el.scrollWidth>el.clientWidth+2),false);
  await page.screenshot({path:`artifacts/request-review/comparison-${width}.png`});
  if(width===1440) {await page.$eval('[aria-label="Close dialog"]',el=>el.click());await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));}
  console.log(`PASS table pagination, custom dropdowns and comparison modal at ${width}px`);
 }
 await page.$eval('#request-review-note',input=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Phone correction verified.');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.$eval('[aria-label="Approve Mobile contact"]',el=>el.click());
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Approve Mobile contact"]'),{timeout:20000});
 let saved=checked(await service.from('rmc_profiles').select('profile').eq('id',student.id).single());
 assert.equal(saved.profile.phone,'0999 111 2222'); assert.equal(saved.profile.guardian.name,'Original Guardian');
 assert.equal(checked(await service.from('rmc_profile_requests').select('status').eq('id',ids[0]).single()).status,'pending');
 await page.$eval('#request-review-note',input=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Guardian correction could not be verified.');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(el=>el.textContent.trim()==='Reject all pending (1)').click());
 await page.waitForFunction(()=>document.querySelector('[role="dialog"]').textContent.includes('Partially approved'),{timeout:20000});
 const request=checked(await service.from('rmc_profile_requests').select('*').eq('id',ids[0]).single());
 assert.equal(request.field_decisions.phone.status,'approved');assert.equal(request.field_decisions.guardianName.status,'rejected');
 saved=checked(await service.from('rmc_profiles').select('profile').eq('id',student.id).single());assert.equal(saved.profile.guardian.name,'Original Guardian');
 assert.equal(checked(await service.from('rmc_notifications').select('id').eq('user_id',student.id).like('source',`profile-request:${ids[0]}:fields:%`)).length,2);
 assert.deepEqual(errors,[]); console.log('PASS individual approval, remaining-field rejection, persisted mixed status and student notifications');
} catch(error) {
 console.error('Browser state:',await page?.evaluate(()=>({url:location.hash,children:document.getElementById('root')?.childElementCount,rows:document.querySelectorAll('table tbody button').length,textLength:document.body.textContent.length})));
 await page?.screenshot({path:'artifacts/request-review/check-failure.png',fullPage:true});
 throw error;
} finally {
 await browser?.close();
 if(patched) {
  checked(await service.from('rmc_profiles').update({profile:student.profile,node_id:student.node_id}).eq('id',student.id));
  for(const application of applications) checked(await service.from('rmc_applications').update({data:application.data}).eq('id',application.id));
  checked(await service.from('rmc_profile_requests').delete().in('id',ids));
  checked(await service.from('rmc_audit').delete().in('target',ids));
  for(const id of ids) checked(await service.from('rmc_notifications').delete().like('source',`profile-request:${id}%`));
 }
}
