import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
const cli = path.join(process.env.APPDATA, 'npm/node_modules/vercel/dist/vc.js');
const endpoint = `/v1/security/firewall/config?projectId=${encodeURIComponent(project.projectId)}&teamId=${encodeURIComponent(project.orgId)}`;
const result = spawnSync(process.execPath, [cli, 'api', endpoint, '--method', 'GET', '--raw'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Firewall request failed');
const config = JSON.parse(result.stdout);
if (process.argv.includes('--prepare') || process.argv.includes('--publish')) {
  fs.writeFileSync(`artifacts/firewall-before-${Date.now()}.local.json`, JSON.stringify(config, null, 2));
}
if (process.argv.includes('--prepare') || process.argv.includes('--publish')) {
  if (config.draft) throw new Error('An existing firewall draft needs review before preparing changes.');
  const current = config.active || {};
  const payload = Object.fromEntries(['firewallEnabled', 'managedRules', 'crs', 'rules', 'rulesets', 'ips', 'botIdEnabled', 'logHeaders']
    .filter(key => current[key] !== undefined).map(key => [key, current[key]]));
  payload.firewallEnabled = true;
  if (Array.isArray(payload.rulesets)) throw new Error('Review the legacy ruleset format before adding managed bot protection.');
  payload.rulesets = { ...payload.rulesets, bot_protection: { action: 'challenge' } };
  const rule = JSON.parse(fs.readFileSync('scripts/firewall-rate-limit.json', 'utf8'));
  payload.rules = [...(payload.rules || []).filter(item => item.name !== rule.name), rule];
  fs.writeFileSync('artifacts/firewall-proposed.local.json', JSON.stringify(payload, null, 2));
  if (process.argv.includes('--publish')) {
    const api = (target, method, input) => {
      const args = [cli, 'api', target, '--method', method, '--raw'];
      if (input) args.push('--input', input);
      const response = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000, windowsHide: true });
      if (response.status !== 0) throw new Error(response.stderr || response.stdout || 'Firewall update failed');
      return JSON.parse(response.stdout);
    };
    api(endpoint, 'PUT', 'artifacts/firewall-proposed.local.json');
    const prepared = api(endpoint, 'GET');
    const draft = prepared.draft;
    if (draft) {
      if (draft.rules.some(item => item.valid === false)) throw new Error('Firewall draft is invalid; not activated.');
      api(`/v1/security/firewall/config/${draft.version}/activate?projectId=${encodeURIComponent(project.projectId)}&teamId=${encodeURIComponent(project.orgId)}`, 'POST');
    }
    // PUT may activate immediately rather than creating a draft. Always read
    // back the active configuration before reporting successful publication.
    const after = api(endpoint, 'GET');
    const activeRule = after.active?.rules?.find(item => item.name === rule.name);
    if (!after.active?.firewallEnabled || after.active.rulesets?.bot_protection?.action !== 'challenge'
      || !activeRule?.active || activeRule.valid === false
      || activeRule.action?.mitigate?.rateLimit?.limit !== rule.action.mitigate.rateLimit.limit) {
      throw new Error('Published firewall settings did not match the proposal. Inspect the active configuration.');
    }
    fs.writeFileSync('artifacts/firewall-after.local.json', JSON.stringify(after, null, 2));
    console.log(JSON.stringify({ active: after.active, draft: after.draft }, null, 2));
  } else console.log('Prepared artifacts/firewall-proposed.local.json. No live firewall changes made.');
} else console.log(JSON.stringify(config, null, 2));
