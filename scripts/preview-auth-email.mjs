import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { authEmailMessages } from '../supabase/functions/_shared/authEmail.ts';
const directory = 'artifacts/auth-email';
fs.mkdirSync(directory,{recursive:true});
const [message] = authEmailMessages({user:{email:'preview@example.test'},email_data:{email_action_type:'signup',token_hash:'preview-'.repeat(10),redirect_to:'https://iars-blond.vercel.app/#/register'}},'https://wpivcedgktsrdsvhsuuu.supabase.co');
// This preview contains a deliberately invalid token and cannot confirm a user.
fs.writeFileSync(`${directory}/confirmation-preview.html`,message.html);
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 for (const width of [320,390,768,1440]) {
  const page = await browser.newPage(); await page.setViewport({width,height:900});
  await page.setContent(message.html,{waitUntil:'networkidle0'});
  const size = await page.evaluate(() => ({content:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(size.content <= size.viewport + 1,`Email overflows at ${width}px`);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('a')].some(link => link.textContent === 'Open IARS website' && link.href === 'https://iars-blond.vercel.app/')),true);
  await page.screenshot({path:`${directory}/confirmation-${width}.png`,fullPage:true}); await page.close();
 }
 console.log('Email preview verified at 320, 390, 768 and 1440 pixels.');
} finally { await browser.close(); }
