import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const base=process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4192';
const accounts=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 for (const role of ['admin','student']) {
  const context=await browser.createBrowserContext(), page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1280,height:900});
  await page.goto(`${base}/#/login`,{waitUntil:'networkidle0'});
  const account=accounts.find(a=>a.role===role);
  await page.waitForSelector('#landing-login-identifier');
  await page.type('#landing-login-identifier',account.username);
  await page.type('#landing-login-password',account.password);
  await page.$eval('#landing-login-password',el=>el.closest('form').requestSubmit());
  await page.waitForFunction(()=>location.hash!=='#/login'&&document.querySelector('main'),{timeout:40000});
  await page.evaluate(async()=>{
   const {appData}=await import('/lib/backend.ts');
   const day=t=>new Date(t+8*3600000).toISOString().slice(0,10);
   const today=day(Date.now()),tomorrow=day(Date.now()+86400000);
   const time=(d,t)=>Date.parse(`${d}T${t}:00+08:00`);
   const event={id:'preview-general',title:'Intramurals Preview',description:'Campus activities, competitions and celebrations.',isGeneralEvent:true,startDate:today,endDate:tomorrow,startTime:time(today,'00:00'),endTime:time(tomorrow,'23:59'),status:'active',kind:'attendance',penaltyValue:0,penaltyUnit:'hours',recipientGroups:['All Students'],geofenceEnabled:false,location:{lat:7.0736,lng:125.6126,radius_meters:100},bannerUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="1600" height="600" fill="#002957"/><text x="100" y="340" font-family="sans-serif" font-size="110" fill="#ffdc00">INTRAMURALS</text></svg>')};
   const child={...event,id:'preview-child',isGeneralEvent:false,parentEventId:event.id,title:'Opening program',bannerUrl:'',venue:'Main gymnasium',endDate:today,endTime:time(today,'23:59'),geofenceEnabled:true,attendanceWindows:[{id:'session',label:'Opening program attendance',timeIn:'00:00',timeOut:'23:59',lateAfterMinutes:15}]};
   const future={...child,id:'preview-future',title:'Sports finals',status:'upcoming',startDate:tomorrow,endDate:tomorrow,startTime:time(tomorrow,'00:00'),endTime:time(tomorrow,'23:59')};
   const fixtures=[event,child,future];
   appData.getEvents=()=>fixtures;appData.getVisibleEvents=()=>fixtures;appData.getRecipientEvents=()=>fixtures;
  });
  const path=role==='admin'?'/ssg/events':'/student/events';
  await page.evaluate(path=>{location.hash=path;},path);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='Intramurals Preview'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Intramurals Preview').click());
  await page.waitForFunction(()=>location.hash.endsWith('/preview-general')&&[...document.querySelectorAll('h1')].some(el=>el.textContent==='Intramurals Preview'));
  assert.equal(await page.$('[role="dialog"]'),null);
  assert.ok(await page.$('img[alt="Intramurals Preview banner"]'));
  assert.ok(await page.evaluate(()=>document.body.textContent.includes('Happening now')&&document.body.textContent.includes('Starts in')));
  await page.evaluate(()=>document.querySelectorAll('[data-toast-root] button').forEach(button=>button.click()));
  for(const width of [1280,375]){
   await page.setViewport({width,height:900});
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
   await page.screenshot({path:`artifacts/general-event-page-${role}-${width}.png`,fullPage:true});
   const wasDark=await page.evaluate(()=>{const dark=document.documentElement.classList.contains('dark');document.documentElement.classList.remove('dark');return dark;});
   await page.screenshot({path:`artifacts/general-event-header-light-${role}-${width}.png`,fullPage:true});
   await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),wasDark);
  }
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Opening program')&&el.textContent.includes('View activity details')).click());
  await page.waitForSelector('[role="dialog"]');
  assert.ok(await page.$('[aria-label="Event geofence map"] .leaflet-container'));
  assert.ok(await page.$eval('[role="dialog"]',el=>el.textContent.includes('100 meters')&&el.textContent.includes('Main gymnasium')&&el.textContent.includes('7.073600')));
  await page.waitForSelector('.leaflet-tile-loaded',{timeout:10000}).catch(()=>{});
  await page.screenshot({path:`artifacts/general-event-activity-${role}-375.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${role}: page navigation, banner, date sections, timing status, modal and geofence map`);
  await context.close();
 }
} finally {await browser.close();}
