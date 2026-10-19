import path from 'path';
import { randomUUID } from 'node:crypto';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { securityHeaders, validatePublicEnvironment } from './security.config.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    validatePublicEnvironment(env);
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
        includeAssets: ['academic-seal-transparent.png', 'avatar-placeholder.svg', 'icons/*.png'],
        manifest: {
          id: '/', name: 'Institution Attendance and Records System', short_name: 'IARS',
          description: 'School attendance, student records, events, and organizations.',
          lang: 'en', start_url: '/', scope: '/', display: 'standalone',
          background_color: '#f8fafc', theme_color: '#2563eb',
          icons: [
            { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
