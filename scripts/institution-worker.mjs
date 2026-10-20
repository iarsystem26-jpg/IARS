import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { enqueueEmails } from '../supabase/functions/_shared/emailQueue.ts';
import { generatePassword, isValidPassword } from '../lib/passwordPolicy.ts';
import { validateInstitutionSetup } from '../lib/institutionBranding.ts';

export const sqlLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
export const migrationBody = sql => sql.replace(/^\uFEFF/, '').replace(/^\s*(?:begin|commit);\s*$/gim, '')
  // Some older projects had this optional Supabase platform helper; fresh projects do not.
  // Preserve the hardening when it exists without requiring a platform-owned function.
  .replace(/revoke execute on function public\.rls_auto_enable\(\) from public,anon,authenticated;/g,
    "do $platform_hardening$ begin if to_regprocedure('public.rls_auto_enable()') is not null then execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated'; end if; end $platform_hardening$;");
export function publicBranding(config, logoUrl) {
  const { adminName, adminEmail, adminUsername, password, adminPassword, initial_password, ...publicFields } = config;
  return { ...publicFields, logoUrl };
}
export function institutionWelcomeEmail(config, workspaceUrl, password, logoUrl) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const subject = `Your ${config.shortName} administrator account is ready`.replace(/[\r\n]/g, ' ').slice(0, 200);
  const text = `Hello ${config.adminName},\n\nYour administrator account for ${config.name} is ready.\nUsername: ${config.adminUsername}\nInitial password: ${password}\nWorkspace: ${workspaceUrl}\n\nSign in and change your password in your account settings. Keep these credentials private.`;
  return { to: config.adminEmail.toLowerCase(), subject, text, logoUrl,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#172033"><img src="${escape(logoUrl)}" width="64" height="64" alt="Institution logo"><h1>${escape(config.name)}</h1><h2>Your administrator account is ready</h2><p>Hello ${escape(config.adminName)},</p><p>Username: <strong>${escape(config.adminUsername)}</strong></p><p>Initial password: <strong>${escape(password)}</strong></p><p><a href="${escape(workspaceUrl)}">Open your workspace</a></p><p>Sign in and change your password in your account settings. Keep these credentials private.</p></div>` };
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checked = result => { if (result.error) throw new Error('Institution database operation failed. Check the operator logs and permissions.'); return result.data; };

export async function runWorker({ managementToken, checkOnly = false, once = false, install = false }, dependencies = {}) {
  if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (fs.existsSync('.env.server.local')) process.loadEnvFile('.env.server.local');
  const env = process.env;
  const hubUrl = env.VITE_SUPABASE_URL;
  const hubRef = new URL(hubUrl).hostname.split('.')[0];
  if (!managementToken || env.IARS_EXPECTED_PROJECT_REF !== hubRef || env.SUPABASE_URL !== hubUrl) throw new Error('Verify the hub project with matching IARS_EXPECTED_PROJECT_REF, SUPABASE_URL, and VITE_SUPABASE_URL.');
  const appUrl = new URL(env.IARS_INSTITUTION_APP_URL || env.IARS_SITE_URL);
  if (appUrl.username || appUrl.password || appUrl.search || appUrl.hash || appUrl.pathname !== '/' || (appUrl.protocol !== 'https:' && !(appUrl.protocol === 'http:' && ['localhost','127.0.0.1'].includes(appUrl.hostname)))) throw new Error('IARS_INSTITUTION_APP_URL must be an HTTPS origin (localhost HTTP is allowed for development).');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const hub = createClient(hubUrl, env.SUPABASE_SERVICE_ROLE_KEY, options);
  async function management(path, method = 'GET', body) {
    const response = await (dependencies.fetch || fetch)(`https://api.supabase.com/v1${path}`, { method, headers: { Authorization: `Bearer ${managementToken}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      const error = new Error(`Supabase management operation failed (HTTP ${response.status}) at ${path.split('?')[0]}. Check organization limits and token permissions.`);
      if (path.endsWith('/database/query') || path.endsWith('/config/auth')) {
        const details = await response.json().catch(() => null);
        error.operatorDetail = String(details?.message || details?.error || '').replaceAll(managementToken, '[credential]').replaceAll(env.IARS_INSTITUTION_SMTP_PASSWORD || '\u0000', '[credential]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').replace(/(?:sbp_|sb_secret_|eyJ)[\w.-]+/g, '[credential]').slice(0, 1200);
      }
      throw error;
    }
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  const organizations = await management('/organizations');
  const hubProject = await management(`/projects/${hubRef}`);
  const organization = env.IARS_SUPABASE_ORGANIZATION_ID || hubProject.organization_slug || hubProject.organization_id;
  if (!organizations.some(org => org.id === organization || org.slug === organization)) throw new Error('The selected Supabase organization is not available to this operator.');
  if (organization !== hubProject.organization_id && organization !== hubProject.organization_slug) throw new Error('The selected organization does not own the configured hub.');
  const query = (ref, sql) => management(`/projects/${ref}/database/query`, 'POST', { query: sql });
  if (install) {
    const file = 'supabase/migrations/20261020044438_institution_branding_registry.sql';
    const existing = await query(hubRef, "select to_regclass('public.rmc_institutions') is not null as installed");
    if (!existing[0]?.installed) await query(hubRef, `begin; ${fs.readFileSync(file, 'utf8')} insert into supabase_migrations.schema_migrations(version,name,statements) values('20261020044438','institution_branding_registry',array[${sqlLiteral(fs.readFileSync(file, 'utf8'))}]) on conflict(version) do nothing; commit;`);
    const credentialsVersion = '20261020100000';
    const installed = await query(hubRef, `select version from supabase_migrations.schema_migrations where version=${sqlLiteral(credentialsVersion)}`);
    if (!installed.length) {
      const credentialsSql = fs.readFileSync('supabase/migrations/20261020100000_institution_administrator_credentials.sql', 'utf8');
      await query(hubRef, `begin; ${credentialsSql} insert into supabase_migrations.schema_migrations(version,name,statements) values(${sqlLiteral(credentialsVersion)},'institution_administrator_credentials',array[${sqlLiteral(credentialsSql)}]); commit;`);
    }
    await query(hubRef, "notify pgrst, 'reload schema'");
    console.log('Institution registry installed on the verified hub.');
  }
  checked(await hub.from('rmc_institutions').select('id').limit(1));
  console.log(`Institution worker verified: organization ${organization}, hub ${hubRef}.`);
  if (checkOnly) return;

  async function provision(job, leaseToken) {
    validateInstitutionSetup(job.config);
    if (!job.project_ref && !env.AUTH_EMAIL_ENCRYPTION_KEY) throw new Error('Configure the hub AUTH_EMAIL_ENCRYPTION_KEY and Gmail delivery worker before creating an institution.');
    if (job.config.slug !== job.slug) throw new Error('Institution ID does not match its setup request.');
    const name = `iars-${hubRef.slice(0, 6)}-${job.id}`;
    const app = new URL(appUrl); app.searchParams.set('institution', job.slug);
    const update = async patch => {
      const rows = checked(await hub.from('rmc_institutions').update({ ...patch, lease_until: new Date(Date.now() + 180000).toISOString() }).eq('id', job.id).eq('lease_token', leaseToken).select('id'));
      if (!rows.length) throw new Error('Provisioning lease was lost. Another worker owns this request.');
    };
    let ref = job.project_ref;
    if (!ref) {
      await update({ status: 'creating', stage: 'Creating a separate database and Auth directory', error: null });
      const projects = await management('/projects');
      const matches = projects.filter(p => p.name === name && [p.organization_id, p.organization_slug].includes(organization));
      if (matches.length > 1) throw new Error('Multiple matching projects need operator reconciliation. No new project was created.');
      const project = matches[0] || await management('/projects', 'POST', { name, organization_slug: organization, db_pass: crypto.randomBytes(36).toString('base64url'), region: env.IARS_SUPABASE_REGION || 'ap-southeast-1' });
      ref = project.ref || project.id;
      if (!/^[a-z]{20}$/.test(ref) || ref === hubRef) throw new Error('The newly created project identity is invalid.');
      await update({ project_ref: ref });
    }
    const target = await management(`/projects/${ref}`);
    if (ref === hubRef || target.name !== name || ![target.organization_id, target.organization_slug].includes(organization)) throw new Error('The target project is not bound to this institution request.');
    for (let attempt = 0; ; attempt++) {
      const state = await management(`/projects/${ref}`);
      if (state.status === 'ACTIVE_HEALTHY') break;
      if (attempt >= 90) throw new Error('The new project is still starting. Retry setup to continue using the same project.');
      await update({ status: 'creating', stage: 'Waiting for the institution database to become healthy' }); await pause(10000);
    }
    await query(ref, 'create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);');
    const applied = new Set((await query(ref, 'select version from supabase_migrations.schema_migrations')).map(row => row.version));
    const migrations = fs.readdirSync('supabase/migrations').filter(file => /^\d+_.+\.sql$/.test(file)).sort();
    for (let i = 0; i < migrations.length; i++) {
      const file = migrations[i]; const [version, ...nameParts] = file.replace(/\.sql$/, '').split('_');
      if (applied.has(version)) continue;
      await update({ status: 'migrating', stage: `Installing institution schema (${i + 1}/${migrations.length})` });
      const sql = migrationBody(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
      // Schema changes and their history marker commit together, so retries never replay half a migration.
      await query(ref, `begin; ${sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${sqlLiteral(version)},${sqlLiteral(nameParts.join('_'))},array[${sqlLiteral(sql)}]); commit;`);
    }
    await query(ref, "notify pgrst, 'reload schema'");
    await update({ status: 'configuring', stage: 'Configuring institution identity, services, and administrator' });
    const keys = await management(`/projects/${ref}/api-keys`);
    const publicKey = keys.find(key => key.name === 'anon')?.api_key;
    const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
    if (!publicKey || !serviceKey) throw new Error('The institution API keys are not available yet. Retry setup shortly.');
    const targetUrl = `https://${ref}.supabase.co`;
    const admin = createClient(targetUrl, serviceKey, options);
    let logoUrl = appUrl.origin + '/iars-icon.png';
    if (job.config.logoUrl) {
      const source = new URL(job.config.logoUrl);
      if (source.origin !== hubUrl || !source.pathname.startsWith('/storage/v1/object/public/institution-logos/')) throw new Error('The logo must be uploaded through this hub.');
      const response = await fetch(source, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok) throw new Error('Could not read the institution logo.');
      const data = await response.arrayBuffer();
      const mime = response.headers.get('content-type')?.split(';')[0];
      if (data.byteLength > 5242880 || !['image/png','image/jpeg','image/webp'].includes(mime)) throw new Error('Invalid institution logo file.');
      const key = `identity/${job.id}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`;
      checked(await admin.storage.from('institution-logos').upload(key, data, { contentType: mime, upsert: true }));
      logoUrl = admin.storage.from('institution-logos').getPublicUrl(key).data.publicUrl;
    }
    checked(await admin.from('rmc_institution_branding').upsert({ id: true, config: publicBranding(job.config, logoUrl) }));
    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const emailTemplate = title => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#172033"><img alt="Institution logo" width="72" height="72" src="${escapeHtml(logoUrl)}"><h1>${escapeHtml(job.config.name)}</h1><h2>${title}</h2><p><a href="{{ .ConfirmationURL }}">${title}</a></p><p>If you did not request this, you can ignore this email.</p></div>`;
    const smtp = env.IARS_INSTITUTION_SMTP_HOST ? { smtp_host: env.IARS_INSTITUTION_SMTP_HOST, smtp_port: env.IARS_INSTITUTION_SMTP_PORT || '587', smtp_user: env.IARS_INSTITUTION_SMTP_USER, smtp_pass: env.IARS_INSTITUTION_SMTP_PASSWORD, smtp_admin_email: env.IARS_INSTITUTION_SMTP_FROM, smtp_sender_name: job.config.name } : {};
    const templates = env.IARS_INSTITUTION_SMTP_HOST ? { mailer_templates_confirmation_content: emailTemplate('Confirm your email'), mailer_templates_recovery_content: emailTemplate('Set your password') } : {};
    await management(`/projects/${ref}/config/auth`, 'PATCH', { site_url: app.href, uri_allow_list: app.href, disable_signup: false, mailer_autoconfirm: false, ...templates, ...smtp });
    // Services use Supabase's own project credentials; no hub service key is copied.
    await management(`/projects/${ref}/secrets`, 'POST', [{ name: 'IARS_SITE_URL', value: appUrl.origin }, { name: 'IARS_INSTITUTION_NAME', value: job.config.name }, { name: 'IARS_INSTITUTION_SLUG', value: job.slug }]);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/supabase/dist/supabase.js','functions','deploy','rmc-login','rmc-enroll','rmc-accounts','rmc-scanner-photo','--use-api','--project-ref',ref], { env: { ...env, SUPABASE_ACCESS_TOKEN: managementToken }, stdio: 'pipe', windowsHide: true });
      child.on('error', () => reject(new Error('Could not start the Supabase CLI.')));
      child.stdout.resume(); child.stderr.resume();
      // Do not forward provider output or command errors containing setup data or keys.
      child.on('close', code => code === 0 ? resolve() : reject(new Error('Institution Edge Function deployment failed. Retry setup after checking CLI access.')));
    });
    let person = checked(await admin.from('rmc_profiles').select('id,role_id,profile').eq('profile->>email', job.config.adminEmail.toLowerCase()).maybeSingle());
    let credential = checked(await hub.from('rmc_institution_credentials').select('initial_password').eq('institution_id', job.id).maybeSingle());
    if (!person && !credential) {
      credential = { initial_password: generatePassword() };
      checked(await hub.from('rmc_institution_credentials').insert({ institution_id: job.id, ...credential }));
    }
    if (credential && !isValidPassword(credential.initial_password)) throw new Error('The initial administrator password does not meet the strength requirements.');
    const initialPassword = credential?.initial_password;
    if (!person) {
      await query(ref, `insert into app_private.provision_reservations(email,actor_id) values(${sqlLiteral(job.config.adminEmail.toLowerCase())},null) on conflict(email) do update set created_at=now()`);
      const profile = { name: job.config.adminName, username: job.config.adminUsername, email: job.config.adminEmail.toLowerCase(), student_id: `${new Date().getUTCFullYear()}-00000A`, school_data: { type: 'College', level: '', section: '' } };
      const created = checked(await admin.auth.admin.createUser({ email: profile.email, password: initialPassword, email_confirm: true, user_metadata: { profile }, app_metadata: { rmc_provisioned: true, institution_job_id: job.id } }));
      person = { id: created.user.id, role_id: 'student', profile: { ...profile, uid: created.user.id } };
    }
    if (person.role_id !== 'admin') {
      const authUser = checked(await admin.auth.admin.getUserById(person.id));
      if (authUser.user.app_metadata?.institution_job_id !== job.id) throw new Error('Initial administrator provisioning requires operator review.');
      person.profile = { ...person.profile, role: 'admin', account_status: 'active' };
      checked(await admin.from('rmc_profiles').update({ profile: person.profile, role_id: 'admin', status: 'active' }).eq('id', person.id));
      checked(await admin.from('rmc_applications').delete().eq('id', person.id));
      person.role_id = 'admin';
    }
    if (person.role_id !== 'admin') throw new Error('The initial administrator identity needs operator review.');
    await update({ status: 'verifying', stage: 'Verifying branding, schema, and cross-project token rejection' });
    const foreignRequest = await fetch(`${targetUrl}/rest/v1/rmc_profiles?select=id&limit=1`, { headers: { apikey: publicKey, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30000) });
    if (foreignRequest.status !== 401 && foreignRequest.status !== 403) throw new Error('The target did not reject a hub credential. Publication stopped.');
    const anonymous = createClient(targetUrl, publicKey, options);
    const identity = checked(await anonymous.from('rmc_institution_branding').select('config').eq('id', true).single());
    if (identity.config.slug !== job.slug) throw new Error('Institution branding verification failed.');
    const registryProbe = await anonymous.from('rmc_institutions').select('id');
    if (!registryProbe.error && registryProbe.data?.length) throw new Error('Anonymous access exposed the institution registry.');
    const profileProbe = await anonymous.from('rmc_profiles').select('id');
    if (!profileProbe.error && profileProbe.data?.length) throw new Error('Anonymous access exposed institution profiles.');
    const functionHealth = await fetch(`${targetUrl}/functions/v1/rmc-login`, { method: 'OPTIONS', headers: { apikey: publicKey }, signal: AbortSignal.timeout(30000) });
    if (!functionHealth.ok) throw new Error('Institution login service health check failed.');
    const link = job.bootstrap_url ? null : checked(await admin.auth.admin.generateLink({ type: 'recovery', email: job.config.adminEmail.toLowerCase(), options: { redirectTo: app.href } }));
    if (credential && !job.admin_email_queued_at) {
      if (!env.AUTH_EMAIL_ENCRYPTION_KEY) throw new Error('Configure AUTH_EMAIL_ENCRYPTION_KEY for the hub email worker before sending institution account emails.');
      // The existing Gmail worker delivers this encrypted, idempotent welcome message.
      await enqueueEmails(hub, [institutionWelcomeEmail(job.config, app.href, initialPassword, logoUrl)], `institution-welcome:${job.id}`, env.AUTH_EMAIL_ENCRYPTION_KEY);
      await update({ admin_email_queued_at: new Date().toISOString() });
    }
    // Publish only after all checks pass. Routes contain only public client configuration.
    checked(await hub.from('rmc_institution_routes').upsert({ slug: job.slug, project_ref: ref, publishable_key: publicKey }));
    await update({ status: 'active', stage: 'Separate database and branded workspace are ready', bootstrap_url: job.bootstrap_url || link.properties.action_link, error: null });
    checked(await hub.from('rmc_institution_credentials').delete().eq('institution_id', job.id));
    console.log(`Institution ${job.slug}: active. Administrator email ${credential || job.admin_email_queued_at ? 'queued' : 'unchanged'}.`);
  }
  do {
    const jobs = checked(await hub.from('rmc_institutions').select('*').in('status', ['queued','creating','migrating','configuring','verifying']).order('created_at').limit(20));
    for (const job of jobs) {
      const leaseToken = crypto.randomUUID();
      const rows = checked(await hub.from('rmc_institutions').update({ lease_until: new Date(Date.now() + 180000).toISOString(), lease_token: leaseToken }).eq('id', job.id).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select('id'));
      if (!rows.length) continue;
      let heartbeatError = false;
      const heartbeat = setInterval(() => { void hub.from('rmc_institutions').update({ lease_until: new Date(Date.now() + 180000).toISOString() }).eq('id', job.id).eq('lease_token', leaseToken).then(result => { if (result.error) heartbeatError = true; }); }, 30000);
      try { await provision(job, leaseToken); }
      catch (error) {
        if (error?.operatorDetail) console.error('Database provisioning detail (operator only):', error.operatorDetail);
        // Only deliberately constructed errors are public. Never persist HTTP bodies, SQL, or tokens.
        const safe = error instanceof Error && !/eyJ|sbp_|sb_secret_|sb_publishable_/.test(error.message) ? error.message.slice(0, 300) : 'Provisioning failed. The operator must check the configuration.';
        const failed = checked(await hub.from('rmc_institutions').update({ status: 'failed', stage: 'Setup paused; the existing project is preserved for retry', error: safe }).eq('id', job.id).eq('lease_token', leaseToken).select('id'));
        if (failed.length) checked(await hub.from('rmc_institution_routes').delete().eq('slug', job.slug));
        console.log(`Institution ${job.slug}: setup failed. No replacement project was created.`);
      } finally { clearInterval(heartbeat); if (heartbeatError) console.warn('A provisioning lease refresh failed.'); checked(await hub.from('rmc_institutions').update({ lease_until: null, lease_token: null }).eq('id', job.id).eq('lease_token', leaseToken)); }
    }
    if (!once) await pause(10000);
  } while (!once);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/institution-worker.mjs')) {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  try { await runWorker(JSON.parse(input.replace(/^\uFEFF/, ''))); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Institution worker failed.'); process.exitCode = 1; }
}
