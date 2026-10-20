import fs from 'node:fs';
import vm from 'node:vm';

process.loadEnvFile('.env.local');
if (fs.existsSync('.env.server.local')) process.loadEnvFile('.env.server.local');
const env = process.env;
const projectUrl = env.VITE_SUPABASE_URL;
const ref = new URL(projectUrl).hostname.split('.')[0];
if (!env.IARS_EXPECTED_PROJECT_REF || ref !== env.IARS_EXPECTED_PROJECT_REF) throw new Error('Set IARS_EXPECTED_PROJECT_REF to the verified educational unit project reference.');
const unitId = env.VITE_EDUCATIONAL_UNIT_ID || 'iars';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(unitId)) throw new Error('Invalid educational unit ID.');
const owner = env.IARS_GAS_OWNER_EMAIL;
const account = env.IARS_CLASP_ACCOUNT;
const parentId = env.IARS_DRIVE_PARENT_FOLDER_ID;
if (!owner || !account || !parentId) throw new Error('Set IARS_GAS_OWNER_EMAIL, IARS_CLASP_ACCOUNT and IARS_DRIVE_PARENT_FOLDER_ID.');
if (!/^[a-zA-Z0-9_-]+$/.test(parentId)) throw new Error('Invalid Drive parent folder ID.');
const credentials = JSON.parse(fs.readFileSync(`${env.USERPROFILE}/.clasprc.json`, 'utf8')).tokens[account];
if (!credentials) throw new Error('Sign in to the selected clasp account first.');
const refresh = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: credentials.client_id, client_secret: credentials.client_secret, refresh_token: credentials.refresh_token, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(30000) });
const auth = await refresh.json();
if (!refresh.ok) throw new Error('Google operator login must be renewed.');
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google configuration failed: HTTP ${response.status}, ${data.error?.status || data.error?.errors?.[0]?.reason || 'unknown'}, ${new URL(url).pathname}`);
  return data;
}
const identity = await api('https://www.googleapis.com/oauth2/v2/userinfo');
if (identity.email !== owner) throw new Error('The Google account does not match the educational unit owner.');
const drive = 'https://www.googleapis.com/drive/v3/files';
const parent = await api(`${drive}/${encodeURIComponent(parentId)}?fields=id,name,mimeType,trashed,owners(emailAddress),capabilities(canAddChildren)`);
if (parent.trashed || parent.mimeType !== 'application/vnd.google-apps.folder' || !parent.capabilities?.canAddChildren || !parent.owners?.some(item => item.emailAddress === owner)) throw new Error('Verify the parent folder owner and write access.');
// Stable project identity prevents another institution using the same display
// name from taking over an existing folder. Never locate unit folders by name.
const query = `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false and appProperties has { key='iarsProject' and value='${ref}' }`;
const existing = await api(`${drive}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100`);
if (existing.files.length > 1) throw new Error('Multiple folders are bound to this project; resolve the duplicate before provisioning.');
const folder = existing.files[0] || await api(drive, 'POST', { name: `${env.VITE_INSTITUTION_NAME || 'IARS'} (${unitId})`, mimeType: 'application/vnd.google-apps.folder', parents: [parentId], appProperties: { iarsProject: ref, iarsUnit: unitId } });
const childQuery = `'${folder.id}' in parents and trashed = false`;
const children = await api(`${drive}?q=${encodeURIComponent(childQuery)}&fields=files(id,name,description)&pageSize=100`);
for (const [category, name] of Object.entries({ photos: 'Profile Photos', logos: 'Organization Logos', banners: 'Event Banners', reports: 'Reports' })) {
  if (!children.files.some(item => item.description === `iars-category:${category}`)) await api(drive, 'POST', { name, mimeType: 'application/vnd.google-apps.folder', parents: [folder.id], description: `iars-category:${category}` });
}
console.log(`Verified educational unit folder: https://drive.google.com/drive/folders/${folder.id}`);
const scriptId = JSON.parse(fs.readFileSync('.clasp.json', 'utf8')).scriptId;
const root = `https://script.googleapis.com/v1/projects/${scriptId}`;
const project = await api(root);
if (project.creator?.email !== owner) throw new Error('The connected GAS project belongs to a different owner.');
const before = await api(`${root}/content`);
const previousConfigSource = before.files.find(file => file.name === 'DriveFolders')?.source;
const boundConfig = previousConfigSource?.match(/function driveDeploymentConfig_\(\) \{ return (\{[^\n]+\}); \}/);
if (boundConfig) {
  const bound = JSON.parse(boundConfig[1]);
  if (bound.supabaseUrl !== projectUrl || (bound.unitId && bound.unitId !== unitId)) throw new Error('This GAS project is already bound to another educational unit. Use its own Apps Script project.');
}
const files = before.files.map(file => ({ name: file.name, type: file.type, source: file.source }));
const config = { unitId, folderId: folder.id, supabaseUrl: projectUrl, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY };
if (!config.publishableKey || /sb_secret_/.test(config.publishableKey)) throw new Error('A public Supabase key is required.');
if (!config.publishableKey.startsWith('sb_publishable_')) {
  let claims;
  try { claims = JSON.parse(Buffer.from(config.publishableKey.split('.')[1], 'base64url').toString()); } catch { /* Reject malformed legacy keys below. */ }
  if (claims?.role !== 'anon') throw new Error('Use a Supabase publishable key or legacy anon key, never an administrative key.');
}
for (const name of ['Code', 'DriveFolders']) {
  let source = fs.readFileSync(`google-apps-script/${name}.gs`, 'utf8');
  if (name === 'DriveFolders') source = source.replace(/function driveDeploymentConfig_\(\) \{[\s\S]*?\n\}/, `function driveDeploymentConfig_() { return ${JSON.stringify(config)}; }`);
  new vm.Script(source);
  const index = files.findIndex(file => file.name === name);
  const file = { name, type: 'SERVER_JS', source };
  if (index < 0) files.push(file); else files[index] = file;
}
const manifest = files.find(file => file.name === 'appsscript');
const settings = JSON.parse(fs.readFileSync('google-apps-script/appsscript.json', 'utf8'));
settings.webapp = { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' };
manifest.source = JSON.stringify(settings, null, 2);
await api(`${root}/content`, 'PUT', { files });
const version = await api(`${root}/versions`, 'POST', { description: 'Educational unit Drive folders with administrator access checks' });
const deployments = await api(`${root}/deployments`);
const previous = deployments.deployments?.find(item => item.deploymentConfig?.description === 'IARS educational unit Drive service');
const deploymentConfig = { versionNumber: version.versionNumber, manifestFileName: 'appsscript', description: 'IARS educational unit Drive service' };
const deployed = previous ? await api(`${root}/deployments/${previous.deploymentId}`, 'PUT', { deploymentConfig }) : await api(`${root}/deployments`, 'POST', deploymentConfig);
const url = deployed.entryPoints?.find(entry => entry.entryPointType === 'WEB_APP')?.webApp?.url;
if (!url) throw new Error('Google did not return a web app URL.');
// Retain a non-secret pending URL for resuming after Google consent.
fs.mkdirSync('supabase/.temp', { recursive: true });
fs.writeFileSync('supabase/.temp/drive-service.json', JSON.stringify({ url, folderId: folder.id, scriptId, version: version.versionNumber }, null, 2));
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
const health = await response.json().catch(() => null);
if (!health || health.error !== 'Use an authorized POST request.') throw new Error(`GAS deployed but Google owner authorization is pending. Open https://script.google.com/home/projects/${scriptId}/edit and run installAuthEmailDelivery after email provisioning. Re-run this script after consent.`);
for (const filename of ['.env.local', ...(fs.existsSync('.env.iars.local') && ref === 'wpivcedgktsrdsvhsuuu' ? ['.env.iars.local'] : [])]) {
  const source = fs.readFileSync(filename, 'utf8');
  const line = `VITE_GOOGLE_DRIVE_GAS_URL=${url}`;
  fs.writeFileSync(filename, /^VITE_GOOGLE_DRIVE_GAS_URL=.*$/m.test(source) ? source.replace(/^VITE_GOOGLE_DRIVE_GAS_URL=.*$/m, line) : `${source}\n${line}\n`);
}
console.log('Verified the public GAS endpoint and configured local image uploads.');
