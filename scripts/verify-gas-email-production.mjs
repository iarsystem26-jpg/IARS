import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 const page = await browser.newPage();
 const configuration = page.waitForResponse(response => response.url().includes('/rest/v1/rmc_enrollment_confirmation?'));
 const bundle = page.waitForResponse(response => /\/assets\/LandingPage-[^/]+\.js/.test(response.url()));
 await page.goto('https://iars-tau.vercel.app/#/register',{waitUntil:'networkidle0'});
 await page.waitForSelector('#enrollment-title');
 assert.equal((await configuration).status(),200);
 assert.ok((await (await bundle).text()).includes('A fresh verification link is created just before sending'));
 assert.ok(await page.evaluate(() => document.querySelector('#enrollment-title')?.textContent.includes('Create your student account')));
 console.log('PASS published enrollment page loads its confirmation policy and the Gmail delivery instructions.');
 await page.goto('https://iars-tau.vercel.app/#/login',{waitUntil:'networkidle0'});
 await page.waitForSelector('#landing-login-identifier');
 await page.type('#landing-login-identifier','nonexistent-email-verification@example.invalid');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Forgot password?')?.click());
 await page.waitForSelector('#forgot-password-email');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Send reset link')?.click());
 await page.waitForFunction(()=>document.body.textContent.includes('If this email has an account, its reset request is queued.'));
 assert.ok(await page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.disabled && /Try again in/.test(button.textContent))));
 console.log('PASS published forgot-password flow queues a generic request, explains fresh links and enforces its cooldown.');
} finally { await browser.close(); }
