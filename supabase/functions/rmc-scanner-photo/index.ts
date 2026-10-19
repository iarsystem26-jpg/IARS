import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { readJson, responseHeaders } from '../_shared/http.ts';
import { rateLimit } from '../_shared/rateLimit.ts';

const fail = (status: number) => Response.json({ error: 'The authorized profile photo is unavailable.' }, { status, headers: responseHeaders });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: responseHeaders });
  if (req.method !== 'POST') return fail(405);
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) return fail(401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const limited = await rateLimit(admin, req, 'scanner-photo');
  if (limited) return limited;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return fail(401);
    const actorLimited = await rateLimit(admin, req, 'scanner-photo', user.id);
    if (actorLimited) return actorLimited;
    const body = await readJson(req, 2048);
    if (![body.sessionId, body.studentUid].every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) return fail(400);
    // The source is obtained from a current, scoped profile; callers cannot supply fetch URLs.
    const { data: source, error } = await caller.rpc('rmc_scanner_photo_source', { offline_session_id: body.sessionId, student_uid: body.studentUid });
    if (error) return fail(403);
    if (!source || typeof source !== 'string') return fail(404);
    const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (body.sourceHash !== sourceHash) return fail(412);
    let blob: Blob;
    if (source.startsWith('storage://rmc-documents/')) {
      const path = source.slice('storage://rmc-documents/'.length);
      if (!path.startsWith(`${body.studentUid}/`) || path.includes('..') || !/\/(photo|profile)\//.test(path)) return fail(403);
      const downloaded = await admin.storage.from('rmc-documents').download(path);
      if (downloaded.error || !downloaded.data || downloaded.data.size > 5 * 1024 * 1024) return fail(404);
      blob = downloaded.data;
    } else {
      const parsed = new URL(source);
      if (parsed.protocol !== 'https:' || !['drive.google.com', 'lh3.googleusercontent.com', 'drive.usercontent.google.com'].includes(parsed.hostname)) return fail(403);
      const id = parsed.searchParams.get('id') || parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1];
      if (!id || !/^[A-Za-z0-9_-]{20,200}$/.test(id)) return fail(403);
      const image = await fetch(`https://lh3.googleusercontent.com/d/${id}=w256`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!image.ok || !image.body || Number(image.headers.get('content-length')) > 1024 * 1024) return fail(404);
      const reader = image.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1024 * 1024) { await reader.cancel(); return fail(413); } chunks.push(value); } }
      finally { reader.releaseLock(); }
      blob = new Blob(chunks as BlobPart[], { type: image.headers.get('content-type')?.split(';')[0] || '' });
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) return fail(415);
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const valid = blob.type === 'image/png' ? head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71
      : blob.type === 'image/jpeg' ? head[0] === 255 && head[1] === 216 && head[2] === 255
      : new TextDecoder().decode(head.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(head.slice(8, 12)) === 'WEBP';
    if (!valid) return fail(415);
    return new Response(blob, { headers: { ...responseHeaders, 'Content-Type': 'application/octet-stream', 'X-Rmc-Image-Type': blob.type, 'Access-Control-Expose-Headers': 'X-Rmc-Image-Type' } });
  } catch { return fail(404); }
});
