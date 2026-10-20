import path from 'path';
import { randomUUID } from 'node:crypto';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { securityHeaders, validatePublicEnvironment } from './security.config.mjs';
import { educationalUnitConfig } from './config/educationalUnit';
import { existsSync, readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    validatePublicEnvironment(env);
    const unit = educationalUnitConfig(env);
    for (const asset of [unit.logoUrl, unit.pwaIcon192, unit.pwaIcon512, unit.pwaMaskable, unit.appleIcon]) {
      if (!existsSync(path.join(process.cwd(), 'public', asset))) throw new Error(`Missing educational unit asset: ${asset}`);
    }
    for (const [asset, size] of [[unit.pwaIcon192, 192], [unit.pwaIcon512, 512], [unit.pwaMaskable, 512], [unit.appleIcon, 180]] as const) {
      const png = readFileSync(path.join(process.cwd(), 'public', asset));
      if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`${asset} must be a ${size}×${size} PNG.`);
    }
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const headers = securityHeaders(env);
    const buildVersion = randomUUID();
    return {
      define: { __APP_BUILD_VERSION__: JSON.stringify(buildVersion) },
      // Prepare the admin chart dependency before serving lazy-loaded routes.
      optimizeDeps: { include: ['recharts'] },
      server: {
        port: 3000,
        strictPort: true,
        host: '127.0.0.1',
        headers: securityHeaders(env, true),
        fs: { deny: ['.env', '.env.*', '**/*.local', '**/*.local.*', '**/*.{crt,pem}', '**/.git/**'] },
      },
      preview: { host: '127.0.0.1', headers },
      plugins: [react(), {
        name: 'production-security-headers',
        transformIndexHtml(html) {
          return html.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(unit.appName)}</title>`)
            .replace(/(<meta name="theme-color" content=")[^"]+/, `$1${unit.primaryColor}`)
            .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]+/, `$1${escapeHtml(unit.shortName)}`)
            .replace('/icons/pwa-192.png', unit.pwaIcon192)
            .replace('/icons/apple-touch-icon.png', unit.appleIcon);
        },
        configurePreviewServer(server) {
          server.middlewares.use((request, response, next) => {
            const pathname = request.url?.split('?')[0];
            if (pathname === '/sw.js' || pathname === '/version.json') response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            else if (['/', '/index.html', '/manifest.webmanifest'].includes(pathname || '')) response.setHeader('Cache-Control', 'no-cache');
            next();
          });
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: buildVersion }) });
          this.emitFile({ type: 'asset', fileName: '_headers', source:
            '/*\n' + Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n') +
            '\n/\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n' +
            '/index.html\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Cache-Control: no-cache\n/version.json\n  Cache-Control: no-cache, no-store, must-revalidate\n' });
        },
      }, VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['iars-icon.png', 'iars-wordmark.png', unit.logoUrl.slice(1), 'avatar-placeholder.svg', 'icons/*.png'],
        manifest: {
          id: '/', name: unit.appName, short_name: unit.shortName,
          description: 'School attendance, student records, events, and organizations.',
          lang: 'en', start_url: '/', scope: '/', display: 'standalone',
          background_color: '#f8fafc', theme_color: unit.primaryColor,
          icons: [
            { src: unit.pwaIcon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: unit.pwaIcon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: unit.pwaMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,jpeg,woff2}'],
          globIgnores: ['**/*.map'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/^\/(?:index\.html)?$/],
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: true,
          // Auth, RPCs, documents, QR tokens, and third-party resources stay on the network.
          runtimeCaching: [],
        },
        devOptions: { enabled: false },
      })],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        // Keep generated browser profiles and verification artifacts out of discovery.
        include: ['App.test.tsx', 'lib/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}', 'views/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        css: true,
        pool: 'threads',
        // Bound jsdom workers so the full suite fits developer machines.
        maxWorkers: 2,
        testTimeout: 30000,
        exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
      }
    };
});
