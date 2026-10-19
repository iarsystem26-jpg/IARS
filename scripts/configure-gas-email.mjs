import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { renderAuthEmail } from '../supabase/functions/_shared/authEmail.ts';
import { encryptEmail } from '../supabase/functions/_shared/emailQueue.ts';

// The PowerShell wrapper supplies the management token over stdin. Never log it.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { managementToken, activate } = JSON.parse(input.replace(/^\uFEFF/,''));
process.loadEnvFile('.env.local');
const projectUrl = process.env.VITE_SUPABASE_URL;
const ref = new URL(projectUrl).hostname.split('.')[0];
const scriptId = '152HJ0s8JgoCkTv4nZ8uQETY0KpGluKcyMfDxlZWTuJjaX-JNDLeC-5V7';
const gasUrl = process.env.VITE_GOOGLE_DRIVE_GAS_URL;
let emailGasUrl;
const owner = 'ssgrmctagum.2@gmail.com';
const credentials = JSON.parse(fs.readFileSync(`${process.env.USERPROFILE}/.clasprc.json`,'utf8')).tokens.ssgrmc;
if (!credentials || !managementToken || !gasUrl) throw new Error('Google and Supabase operator credentials are required.');
async function jsonApi(url,token,method = 'GET',body) {
 const response = await fetch(url,{ method, headers: { Authorization: `Bearer ${token}`,'Content-Type':'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 if (!response.ok) {
  const error = await response.json().catch(() => null);
  const reason = error?.error?.status || error?.error?.errors?.[0]?.reason || 'unknown';
  throw new Error(`Configuration request failed (HTTP ${response.status}, ${reason}) at ${new URL(url).pathname}; no credentials or provider bodies were logged.`);
 }
 const text = await response.text(); return text ? JSON.parse(text) : null;
}
const authResponse = await fetch('https://oauth2.googleapis.com/token',{ method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'}) });
const googleAuth = await authResponse.json();
if (!authResponse.ok) throw new Error('Google operator login must be renewed.');
const google = (path,method,body) => jsonApi(`https://script.googleapis.com/v1/projects/${scriptId}${path}`,googleAuth.access_token,method,body);
const management = (path,method,body) => jsonApi(`https://api.supabase.com/v1/projects/${ref}${path}`,managementToken,method,body);
const identity = await jsonApi('https://www.googleapis.com/oauth2/v2/userinfo',googleAuth.access_token);
if (identity.email !== owner) throw new Error('Sign in with the GAS owner account.');
const content = await google('/content');
const previousConfig = content.files.find(file => file.name === 'MailConfiguration')?.source;
const existing = previousConfig?.match(/return (\{.*\});/);
if (activate && !existing) throw new Error('Run the email provisioning script before activation.');
const config = existing ? JSON.parse(existing[1]) : {
 secret:crypto.randomBytes(32).toString('hex'),workerUrl:`${projectUrl}/functions/v1/rmc-email-worker`,
 encryptionKey:crypto.randomBytes(32).toString('base64'),hookSecret:`v1,whsec_${crypto.randomBytes(32).toString('base64')}`,
};
if (!config.secret || !config.encryptionKey || !config.hookSecret || config.workerUrl !== `${projectUrl}/functions/v1/rmc-email-worker`) throw new Error('Unexpected existing private email configuration.');
if (!activate) {
 await management('/secrets','POST',[
  {name:'AUTH_EMAIL_WORKER_SECRET',value:config.secret},{name:'AUTH_EMAIL_ENCRYPTION_KEY',value:config.encryptionKey},{name:'SEND_EMAIL_HOOK_SECRET',value:config.hookSecret},
 ]);
 console.log('Configured server-only email secrets.');
 const files = content.files.map(file => ({ name:file.name,type:file.type,source:file.source }));
 const code = files.find(file => file.name === 'Code');
 code.source = fs.readFileSync('google-apps-script/Code.gs','utf8');
 new vm.Script(code.source);
 const manifest = files.find(file => file.name === 'appsscript');
 const settings = JSON.parse(manifest.source);
 settings.oauthScopes = [...new Set([...(settings.oauthScopes || []),'https://mail.google.com/','https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/script.external_request','https://www.googleapis.com/auth/script.scriptapp','https://www.googleapis.com/auth/userinfo.email'])];
 manifest.source = JSON.stringify(settings,null,2);
 const generated = {name:'MailConfiguration',type:'SERVER_JS',source:`// Private server-only deployment configuration. Do not copy into frontend code.\nfunction authEmailConfig_() { return ${JSON.stringify(config)}; }\n`};
 const index = files.findIndex(file => file.name === generated.name);
 if (index >= 0) files[index] = generated; else files.push(generated);
 await google('/content','PUT',{files});
 const version = await google('/versions','POST',{description:'GmailApp queued authentication delivery and branded responsive emails'});
 const deployments = await google('/deployments');
 if (!deployments.deployments.some(item => item.deploymentId === new URL(gasUrl).pathname.split('/')[3])) throw new Error('Configured GAS deployment does not belong to the owner project.');
 const emailDeployment = deployments.deployments.find(item => item.deploymentConfig.description === 'IARS Gmail authentication email service');
 const deployed = emailDeployment
  ? await google(`/deployments/${emailDeployment.deploymentId}`,'PUT',{deploymentConfig:{...emailDeployment.deploymentConfig,versionNumber:version.versionNumber}})
  : await google('/deployments','POST',{versionNumber:version.versionNumber,manifestFileName:'appsscript',description:'IARS Gmail authentication email service'});
 emailGasUrl = deployed.entryPoints.find(entry => entry.entryPointType === 'WEB_APP').webApp.url;
 console.log(`Deployed GAS email worker as version ${version.versionNumber}.`);
 const result = spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','functions','deploy','rmc-send-email','rmc-email-worker','rmc-email-request','--use-api','--project-ref',ref],{ env:{...process.env,SUPABASE_ACCESS_TOKEN:managementToken},stdio:'inherit',windowsHide:true });
 if (result.status !== 0) throw new Error('Edge Function deployment failed.');
}
if (!emailGasUrl) {
 const deployments = await google('/deployments');
 const deployment = deployments.deployments.find(item => item.deploymentConfig.description === 'IARS Gmail authentication email service');
 emailGasUrl = deployment?.entryPoints.find(entry => entry.entryPointType === 'WEB_APP').webApp.url;
 if (!emailGasUrl) throw new Error('Email GAS deployment is missing.');
}
const healthResponse = await fetch(emailGasUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'email_setup',secret:config.secret})});
const health = await healthResponse.json().catch(() => null);
if (!health?.success || !health.gmailAuthorized || !health.installed) {
 console.log(`Google Gmail authorization is required. Sign in as ${owner}, open https://script.google.com/home/projects/${scriptId}/edit and run installAuthEmailDelivery. Then run: powershell -NoProfile -File scripts/configure-gas-email.ps1 -Activate`);
 process.exitCode = 2;
} else {
 console.log('Verified Gmail authorization and the every-minute delivery trigger.');
 // Send one real smoke test to the authenticated owner before replacing SMTP.
 const message = renderAuthEmail(owner,'IARS email delivery is ready','This test confirms that the IARS email worker is sending through GmailApp.','Open IARS website','https://rmcssg.vercel.app/');
 const event = `setup-test:${crypto.randomUUID()}`;
 const payload = await encryptEmail(message,config.encryptionKey);
 await management('/database/query','POST',{query:`insert into public.rmc_auth_email_queue(event_key,payload) values ('${event}','${payload}');`});
 // Private setup invokes an immediate pass to verify delivery and acknowledgement.
 const flushResponse = await fetch(emailGasUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'email_flush',secret:config.secret})});
 const flush = await flushResponse.json().catch(() => null);
 if (!flush?.success) throw new Error('Gmail test worker failed. The Auth hook remains unchanged.');
 const status = await management('/database/query','POST',{query:`select status from public.rmc_auth_email_queue where event_key='${event}';`});
 if (status[0]?.status !== 'sent') throw new Error('Gmail test email was not acknowledged. The Auth hook remains unchanged.');
 console.log('Verified a real GmailApp email to the owner account.');
 await management('/config/auth','PATCH',{hook_send_email_enabled:true,hook_send_email_uri:`${projectUrl}/functions/v1/rmc-send-email`,hook_send_email_secrets:config.hookSecret,rate_limit_email_sent:30});
 const verified = await management('/config/auth');
 if (!verified.hook_send_email_enabled || verified.hook_send_email_uri !== `${projectUrl}/functions/v1/rmc-send-email`) throw new Error('Auth hook verification failed.');
 const deployEnrollment = spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','functions','deploy','rmc-enroll','--use-api','--project-ref',ref],{env:{...process.env,SUPABASE_ACCESS_TOKEN:managementToken},stdio:'inherit',windowsHide:true});
 if (deployEnrollment.status !== 0) throw new Error('Enrollment delivery function deployment failed.');
 console.log('Authentication email delivery activated: Supabase signs links, GAS sends through GmailApp.');
}
