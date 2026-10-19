import fs from 'node:fs';
import { loadEnv } from 'vite';
import { securityHeaders, validatePublicEnvironment } from '../security.config.mjs';

const env = loadEnv('production', process.cwd(), 'VITE_');
validatePublicEnvironment(env);
const headers = securityHeaders(env);
fs.writeFileSync('vercel.json', JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'vite',
  buildCommand: 'npm run build', outputDirectory: 'dist',
  headers: [
    { source: '/(.*)', headers: Object.entries(headers).map(([key, value]) => ({ key, value })) },
    { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    { source: '/version.json', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
  ],
}, null, 2) + '\n');
console.log('Configured Vercel security headers for the production backend origin.');
