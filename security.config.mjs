// Shared by Vite and production deployment. Never place credentials in this file.
export function validatePublicEnvironment(env) {
  for (const [name, value] of Object.entries(env)) {
    if (value && /^VITE_.*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|DATABASE_URL)/i.test(name)) {
      throw new Error(`${name} must not be exposed in the browser.`);
    }
    if (name.startsWith('VITE_') && typeof value === 'string') {
      let role;
      try { role = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role; } catch { /* Not a JWT. */ }
      if (value.startsWith('sb_secret_') || role === 'service_role') throw new Error(`${name} contains a privileged key and must not be exposed in the browser.`);
    }
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !key.startsWith('sb_publishable_')) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* rejected below */ }
    if (role !== 'anon') throw new Error('Use a Supabase publishable key or legacy anon key in the frontend.');
  }
  if (env.VITE_SUPABASE_URL) {
    const url = new URL(env.VITE_SUPABASE_URL);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !localHttp)) {
      throw new Error('VITE_SUPABASE_URL must use HTTPS (HTTP is allowed only on localhost).');
    }
  }
}

export function securityHeaders(env = {}, development = false) {
  const backend = new URL(env.VITE_SUPABASE_URL || 'https://unconfigured.supabase.co');
  const socket = `${backend.protocol === 'https:' ? 'wss:' : 'ws:'}//${backend.host}`;
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' https://accounts.google.com/gsi/client${development ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' ${backend.origin} ${socket} https://accounts.google.com/gsi/ https://script.google.com https://script.googleusercontent.com${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    `img-src 'self' data: blob: ${backend.origin} https://i.imgur.com https://drive.google.com https://drive.usercontent.google.com https://*.googleusercontent.com https://*.tile.openstreetmap.org`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob: https://www.google.com https://accounts.google.com/gsi/",
    ...(!development && backend.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  return {
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
    ...(!development ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
