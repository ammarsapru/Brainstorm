import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves from /Brainstorm/ — all other targets (Docker, Electron, dev) use ./
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const isElectron = process.env.ELECTRON === 'true';
const base = isGithubPages ? '/Brainstorm/' : './';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
    },
    base,
    plugins: [
      react(),
      // PWA disabled for Electron (uses local files, not a web origin)
      !isElectron && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['brainstorm-logo.png', 'brainstorm-logo.svg'],
        manifest: false, // We use our own public/manifest.json
        workbox: {
          skipWaiting: true,        // Activate new SW immediately on deploy
          clientsClaim: true,       // New SW takes control of all tabs right away
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
