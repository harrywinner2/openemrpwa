import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites at /<repo-name>/ — configurable via env.
// Defaults to '/' for local dev (`npm run dev`).
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'OpenEMR Patient Dashboard',
        short_name: 'EMR Dashboard',
        description: 'A modern reimplementation of the OpenEMR clinician patient dashboard.',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Workbox default for non-precached requests is NetworkOnly, so the
        // /apis/default/fhir/* endpoints (PHI) are never cached. We explicitly
        // do NOT add a runtimeCaching rule for those endpoints.
        navigateFallbackDenylist: [/^\/oauth-callback/],
      },
    }),
  ],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
});
