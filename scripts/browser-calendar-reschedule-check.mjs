// Uses approved test accounts and removes its temporary event fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const accounts=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8'));
const account=accounts.find(value=>value.role==='admin'), studentAccount=accounts.find(value=>value.role==='student');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options), service=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const checked=response=>{if(response.error)throw Error(response.error.message);return response.data;};
const prefix=`verify-reschedule-${Date.now()}`, ids=[], base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4175';
const day=offset=>new Date(Date.now()+(offset*24+8)*3600000).toISOString().slice(0,10);
let browser;
try {
 checked(await admin.auth.signInWithPassword({email:account.email,password:account.password}));
 const student=checked(await service.from('rmc_profiles').select('id,is_test_account').eq('profile->>username',studentAccount.username).single());
 assert.equal(student.is_test_account,true);
 const event=(name,start,end,extra={})=>({title:`${prefix} ${name}`,description:'Temporary schedule verification',kind:'attendance',status:'upcoming',startDate:start,endDate:end,startTime:Date.parse(`${start}T08:00:00+08:00`),endTime:Date.parse(`${end}T10:00:00+08:00`),audienceTarget:{mode:'specific_people',specificUserIds:[student.id]},participantsType:'specific',specificParticipants:[student.id],target:{all:false},penaltyValue:0,penaltyUnit:'hours',geofenceEnabled:false,attendanceWindows:[{id:'morning',label:'Morning',timeIn:'08:00',timeOut:'10:00',lateAfterMinutes:15}],...extra});
 const parent=checked(await admin.rpc('rmc_command',{action:'createEvent',args:[event('School week',day(8),day(11),{isGeneralEvent:true,attendanceWindows:[]})]}));ids.push(parent);
 for(const [name,offset] of [['Opening',8],['Closing',10]])ids.push(checked(await admin.rpc('rmc_command',{action:'createEvent',args:[event(name,day(offset),day(offset),{parentEventId:parent})]})));
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 const page=await browser.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewport({width:1280,height:1000});
 await page.goto(`${base}/#/login`,{waitUntil:'networkidle0'});
 await page.type('#landing-login-identifier',account.username);await page.type('#landing-login-password',account.password);await page.$eval('#landing-login-password',input=>input.closest('form').requestSubmit());
 await page.waitForFunction(()=>location.hash!=='#/login'&&document.querySelector('main'),{timeout:40000});
 await page.goto(`${base}/#/student/calendar`,{waitUntil:'networkidle0'});
 await page.waitForSelector('#calendar-month');
 await page.$eval('#calendar-month',(input,month)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,month);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},day(8).slice(0,7));
 await page.waitForFunction(day=>[...document.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')?.startsWith(day)&&button.getAttribute('aria-label').endsWith('1 sessions')),{},day(8));
 await page.evaluate(day=>[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.startsWith(day)).click(),day(8));
 await page.waitForFunction(prefix=>document.querySelector(`section[aria-label="General event: ${prefix} School week"]`)?.textContent.includes(`${prefix} Opening`),{},prefix);
 assert.equal(await page.$eval(`section[aria-label="General event: ${prefix} School week"]`,group=>group.querySelectorAll('article').length),1);
 for(const width of [375,1280])for(const dark of [false,true]){await page.setViewport({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:`.calendar-grouped-${width}-${dark?'dark':'light'}.local.png`,fullPage:true});}
 const click=async text=>page.evaluate(text=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===text);if(!button)throw Error(`Missing button ${text}`);button.click();},text);
 await click('View general event');await page.waitForSelector('[role="dialog"]');
 assert.equal(await page.$$eval('[role="dialog"] article h4',(nodes,prefix)=>nodes.filter(node=>node.textContent.startsWith(prefix)).length,prefix),2);
 assert.equal(await page.$$eval('[role="dialog"] article',nodes=>nodes.filter(node=>node.textContent.includes('Morning')&&node.textContent.includes('8:00 AM')).length),2);
 for(const width of [375,1280])for(const dark of [false,true]){await page.setViewport({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] h3')].find(node=>node.textContent==='Specific activities').scrollIntoView({block:'start'}));await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await page.$eval('[role="dialog"]',dialog=>dialog.scrollWidth>dialog.clientWidth+2),false);await page.screenshot({path:`.calendar-general-activities-${width}-${dark?'dark':'light'}.local.png`});}
 await click('Close details');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Holidays & Suspensions'));
 await click('Holidays & Suspensions');await page.waitForFunction(()=>location.hash==='#/admin/calendar');await page.waitForSelector('input[placeholder="e.g. Weather suspension"]');
 const fill=async(label,value)=>page.evaluate(({label,value})=>{const node=[...document.querySelectorAll('label')].find(node=>node.textContent.startsWith(label));const input=node?.querySelector('input,textarea');if(!input)throw Error(`Missing field ${label}`);Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},{label,value});
 await fill('Title','Browser verification');await fill('Official reason','Temporary preview only');await fill('Through date',day(8));await fill('From date',day(8));
 await click('Entire school');await click('Selected academic units');
 await page.waitForFunction(()=>document.body.textContent.includes('Follow the academic path'));
 for(const width of [375,1280]) {
  await page.setViewport({width,height:1000});await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:`.calendar-unit-picker-${width}.local.png`,fullPage:true});
 }
 await click('Selected academic units');await click('Entire school');await click('Suspend affected attendance only');await click('Reschedule selected activities together');await click('Preview affected activities');
 await page.waitForSelector(`input[aria-label="Select ${prefix} School week"]`,{timeout:30000});
 assert.equal(await page.$$eval('main article h3',(nodes,prefix)=>nodes.filter(node=>node.textContent.startsWith(prefix)).length,prefix),3);
 await page.click(`input[aria-label="Select ${prefix} School week"]`);
 assert.equal(await page.$eval(`input[aria-label="Select ${prefix} Closing"]`,input=>input.checked&&input.disabled),true);
 await fill(`New start date for ${prefix} School week`,day(15));await click('Preview new schedules');
 await page.waitForFunction(()=>document.body.textContent.includes('3 activities validated'),{timeout:30000});
 for(const width of [375,1280])for(const dark of [false,true]) {
  await page.setViewport({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:`.calendar-reschedule-${width}-${dark?'dark':'light'}.local.png`,fullPage:true});
 }
 await click('Review and apply');await page.waitForSelector('[role="dialog"]');assert.ok(await page.$eval('[role="dialog"]',dialog=>dialog.textContent.includes('Reschedule 3 activities')));await click('Back to preview');
 assert.deepEqual(errors,[]);console.log('PASS: calendar editor button, cascading picker surface, general/specific dates, validated preview and review dialog, mobile/desktop light/dark, no browser errors.');
}finally{
 if(browser)await browser.close();
 for(const id of ids.reverse()){checked(await service.from('rmc_notifications').delete().like('source',`event:${id}:%`));checked(await service.from('rmc_events').delete().eq('id',id));}
 await admin.auth.signOut();console.log('Temporary schedule fixtures removed. No closures applied.');
}
