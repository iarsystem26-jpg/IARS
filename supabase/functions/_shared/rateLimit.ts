import { responseHeaders } from './http.ts';

export async function rateLimit(admin: any, req: Request, route: string, actorId?: string): Promise<Response | null> {
  // The deployed gateway must overwrite this header. Never use a browser-supplied
  // user ID or API key as an authenticated identity. Missing IPs share a bucket.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
  try {
    const { data, error } = await admin.rpc('rmc_edge_rate_limit', {
      route_name: route, subject_hash: await digest(actorId ? `user:${actorId}` : `ip:${ip}`), authenticated_actor: Boolean(actorId),
    });
    if (error || !Number.isInteger(data) || data < 0) throw new Error('Rate limiter unavailable');
    if (data === 0) return null;
    return Response.json({ error: 'Too many requests. Please wait before trying again.', retryAfter: data }, {
      status: 429, headers: { ...responseHeaders, 'Retry-After': String(data), 'Access-Control-Expose-Headers': 'Retry-After' },
    });
  } catch {
    // Fail closed rather than allowing unlimited costly work during an outage.
    return Response.json({ error: 'This service is temporarily unavailable. Please try again shortly.' }, {
      status: 503, headers: { ...responseHeaders, 'Retry-After': '30', 'Access-Control-Expose-Headers': 'Retry-After' },
    });
  }
}
