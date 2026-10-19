import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const account=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8')).find(a=>a.role==='admin');
const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage();
const click=async text=>{const h=await page.waitForFunction(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t&&!b.disabled),{},text);await h.asElement().click();};
try {
 await page.setViewport({width:1366,height:950});
 await page.goto('http://127.0.0.1:3000/#/login',{waitUntil:'networkidle0'});
 await page.waitForSelector('#landing-login-identifier'); await page.type('#landing-login-identifier',account.username); await page.type('#landing-login-password',account.password);
 await page.$eval('#landing-login-password',el=>el.closest('form').requestSubmit());
 await page.waitForFunction(()=>location.hash!=='#/login',{timeout:40000});
 await page.goto('http://127.0.0.1:3000/#/ssg/ceremonies/create',{waitUntil:'networkidle0'});
 await page.waitForSelector('[aria-label="Calendar month"]');
 await page.$eval('[aria-label="Calendar month"]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Automatically predict dates');
 const dates=await page.$$eval('button[aria-label^="Remove 2026-"]',buttons=>buttons.map(b=>b.getAttribute('aria-label').slice(7)));
 assert.deepEqual(dates,['2026-10-05','2026-10-12','2026-10-19','2026-10-26']);
 for (const width of [1366,390]) {
  await page.setViewport({width,height:width===390?844:950});
  if(width===390)await page.waitForFunction(()=>document.querySelector('main').getBoundingClientRect().left<1);
  await page.$eval('[aria-label="Ceremony calendar"]',el=>el.scrollIntoView({block:'center'}));
  for (const label of ['Previous month','Next month']) {
   const w=await page.$eval(`[aria-label="${label}"]`,el=>el.getBoundingClientRect().width);
   assert.ok(w<=140,`${label} should be compact; got ${w}`);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.screenshot({path:`artifacts/month-prediction-${width}.png`});
 }
 await page.click('[aria-label="Next month"]');
 assert.equal(await page.$eval('[aria-label="Calendar month"]',el=>el.value),'2026-11');
 await click('Automatically predict dates');
 await page.waitForSelector('[aria-label="Remove 2026-11-23"]');
 console.log('PASS: four October Mondays, navigated-month prediction, compact desktop/mobile calendar controls.');
} finally {await browser.close();}
