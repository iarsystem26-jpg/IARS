import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { previewEmailIntent } from '../supabase/functions/_shared/emailPreview.ts';
process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const operator=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtureId=crypto.randomUUID();
const fixture=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8')).find(account=>account.role==='admin');
if(!fixture)throw new Error('Existing Super Admin test fixture required.');
const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await client.auth.signInWithPassword({email:fixture.email,password:fixture.password});
if(login.error)throw new Error('Admin fixture login failed.');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 const preview=previewEmailIntent({kind:'intent',userId:fixture.uid,email:fixture.email,recipient:fixture.email,action:'recovery',redirect:'https://iars-blond.vercel.app/'});
 const inserted=await operator.from('rmc_email_history').insert({id:fixtureId,recipient:fixture.email,subject:'Temporary dashboard preview verification',kind:'recovery',status:'sent',created_at:new Date().toISOString(),sent_at:new Date().toISOString(),attempts:1,preview_html:preview.html,preview_text:preview.text});
 if(inserted.error)throw new Error('Unable to create temporary dashboard fixture.');
 const page=await browser.newPage();
 const key=`sb-${new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
 await page.evaluateOnNewDocument((key,session)=>localStorage.setItem(key,JSON.stringify(session)),key,login.data.session);
 await page.goto('https://iars-blond.vercel.app/#/admin/controls?tab=email',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('Verify identity to configure enrollment'));
 assert.ok(!await page.evaluate(()=>document.body.textContent.includes('Email activity')));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Verify identity to configure enrollment')).click());
 await page.waitForSelector('input[autocomplete="current-password"]');
 await page.type('input[autocomplete="current-password"]',fixture.password);
 await page.evaluate(()=>{const labels=[...document.querySelectorAll('label')];const input=labels.find(label=>label.textContent.includes('Type initiate')).querySelector('input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'initiate');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Confirm and open editor') && !button.disabled));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Confirm and open editor')).click());
 await page.waitForFunction(()=>document.body.textContent.includes('Email activity'));
 await page.waitForFunction(()=>document.querySelector('section[aria-label="Sent emails"] table'));
 for(const width of [1440,390]) {
  await page.setViewport({width,height:1000});
  await new Promise(resolve=>setTimeout(resolve,800));
  assert.ok(await page.evaluate(()=>document.querySelectorAll('table').length>=2));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Page overflows at mobile width.');
 }
 assert.ok(!await page.evaluate(()=>document.body.textContent.includes('Unable to load email')));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.startsWith('Preview Temporary dashboard preview verification')).click());
 await page.waitForSelector('iframe[title="Safe email layout preview"]');
 const frame=(await page.$('iframe[title="Safe email layout preview"]'));const content=await frame.contentFrame();
 await content.waitForSelector('img');
 assert.ok(await content.evaluate(()=>document.body.textContent.includes('Reset your IARS password')));
 assert.ok(!await content.evaluate(()=>[...document.querySelectorAll('a')].some(link=>link.href.includes('/auth/v1/verify'))));
 console.log('PASS production Email section: identity gate, analytics, separate tables, desktop/mobile layout and safe rendered preview. No email sent.');
} finally {await operator.from('rmc_email_history').delete().eq('id',fixtureId);await browser.close();await client.auth.signOut();}
