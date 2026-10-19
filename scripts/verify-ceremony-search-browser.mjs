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

 await page.waitForSelector('input[placeholder="Search name, student ID, or class"]');
 const student='input[placeholder="Search name, student ID, or class"]';
 await page.type(student,'TESTSTUDENT');
 await page.waitForSelector('[role="option"]');
 assert.match(await page.$eval('[role="option"]',el=>el.textContent),/Pedro/);
 await page.keyboard.press('Enter');
 await page.waitForSelector('[aria-label="Remove exemption for Pedro Penduko"]');
 assert.equal(await page.$eval(student,el=>el.value),'');
 await page.type(student,'Pedro');
 assert.equal(await page.$$eval('[role="option"]',els=>els.length),0);
 await page.keyboard.press('Escape');
 await page.click('[aria-label="Remove exemption for Pedro Penduko"]');
 const classes='input[placeholder="Search class, section code, course, or campus"]';
 await page.type(classes,'2spb');
 await page.waitForSelector('[role="option"]');
 assert.match(await page.$eval('[role="option"]',el=>el.textContent),/2SP - B/);
 for (const width of [1366,390]) {
  await page.setViewport({width,height:width===390?844:950});
  if(width===390)await page.waitForFunction(()=>document.querySelector('main').getBoundingClientRect().left<1);
  await page.$eval(classes,el=>el.scrollIntoView({block:'center'}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`artifacts/ceremony-search-${width}.png`});
 }
 await page.click('[role="option"]');
 await page.waitForSelector('input[aria-label$="timeIn 1"]');
 assert.equal(await page.$eval(classes,el=>el.value),'');
 console.log('PASS: smart student/class matching, keyboard and click selection, duplicate exclusion, removal, desktop/mobile layouts.');
} finally {await browser.close();}
