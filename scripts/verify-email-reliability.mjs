import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { prepareEmailIntent } from '../supabase/functions/_shared/emailIntent.ts';
process.loadEnvFile('.env.local');process.loadEnvFile('.env.server.local');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixture=JSON.parse(fs.readFileSync('.demo-accounts.local','utf8')).find(account=>account.role==='student');
if(!fixture)throw new Error('An existing student test fixture is required.');
const user=await admin.auth.admin.getUserById(fixture.uid);
if(user.error || user.data.user?.email!==fixture.email)throw new Error('Test fixture identity does not match.');
// Generates a recovery token for the existing test fixture; never sends an email,
// changes a password, creates an account, or logs an authentication token.
const message=await prepareEmailIntent(admin,{kind:'intent',userId:fixture.uid,email:fixture.email,recipient:fixture.email,action:'recovery',redirect:'https://iars-blond.vercel.app/'});
if(!message?.text.includes('type=recovery') || !message.html.includes('Reset password'))throw new Error('Fresh recovery link preparation failed.');
console.log('PASS live Supabase recovery link generated at dispatch for the existing test fixture; no email sent.');
const body={action:'recovery',email:'nonexistent-email-verification@example.invalid'};
const reply=await fetch(`${process.env.SUPABASE_URL}/functions/v1/rmc-email-request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
if(reply.status!==200 || !(await reply.json()).accepted)throw new Error('Generic public recovery response failed.');
console.log('PASS live forgot-password request gives a generic queued response for an unknown account.');
const denied=await admin.rpc('rmc_email_delivery_stats');
if(!denied.error)throw new Error('Tracker allowed a caller without a verified Super Admin identity.');
console.log('PASS tracker requires an active Super Admin identity even with a privileged operator client.');
