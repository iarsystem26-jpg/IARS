import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local'); process.loadEnvFile('.env.server.local');
const base = 'https://iars-blond.vercel.app';
const backend = process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const report = { date: new Date().toISOString(), target: { students: 5000, scanners: 100 }, scope: 'Bounded read baseline on current demo data; not a full target-capacity test.', results: [] };
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length*fraction)-1)];
async function measure(label, concurrency, url, init = {}) {
  const durations = [], bytes = [], statuses = {}; let failures = 0;
  const sample = async () => {
    const started = performance.now();
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      bytes.push((await r.arrayBuffer()).byteLength);
      durations.push(performance.now()-started);
      if (!r.ok) failures++;
    } catch { failures++; statuses.network_error = (statuses.network_error || 0) + 1; }
  };
  const started = performance.now();
  for (let sent = 0; sent < 6; sent += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, 6-sent) }, sample));
    if (failures > 1) break;
  }
  const result = { label, concurrency, requests: Object.values(statuses).reduce((a,b)=>a+b,0), statuses, failures,
    p50Ms: Math.round(percentile(durations,0.5)||0), p95Ms: Math.round(percentile(durations,0.95)||0),
    averageBytes: Math.round(bytes.reduce((a,b)=>a+b,0)/(bytes.length||1)), durationMs: Math.round(performance.now()-started) };
  report.results.push(result); console.log(JSON.stringify(result));
  assert.equal(failures,0,`${label} failed; stopping instead of increasing load`);
}
try {
  const page = await fetch(base); assert.equal(page.status,200);
  const html = await page.text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1]; assert.ok(asset,'Built JS entry missing');
  const cached = await fetch(new URL(asset,base)); await cached.arrayBuffer();
  report.cdn = { htmlStatus:page.status, assetStatus:cached.status, cache:cached.headers.get('x-vercel-cache'), servingRegion:cached.headers.get('x-vercel-id')?.split('::')[0] };
  await measure('Vercel static JS',5,new URL(asset,base));
  const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local','utf8'));
  for(const role of ['student','mayor','admin']) {
    const account = accounts.find(a=>a.role===role); assert.ok(account,`Missing prepared ${role} account`);
    const client = createClient(backend,key,{auth:{persistSession:false,autoRefreshToken:false}});
    try {
      const {data,error}=await client.auth.signInWithPassword({email:account.email,password:account.password}); if(error)throw error;
      const init = { method:'POST',headers:{apikey:key,Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:'{}' };
      for(const concurrency of [1,3,5]) await measure(`${role} snapshot`,concurrency,`${backend}/rest/v1/rpc/rmc_snapshot`,init);
    } finally { await client.auth.signOut(); }
  }
} finally {
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/load-capacity-baseline.local.json',JSON.stringify(report,null,2));
}
