/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new build must never swap the app out
      // from under someone mid-edit. The service worker installs and waits;
      // src/pwa/useAppUpdate.ts surfaces the "Hay una nueva versión" toast,
      // and only that explicit click calls updateServiceWorker(true).
      registerType: 'prompt',
      // We register the SW ourselves via the `virtual:pwa-register/react` hook
      // (src/pwa/useAppUpdate.ts) instead of the plugin's auto-injected script.
      injectRegister: null,
      manifest: {
        name: 'Nubih Creator',
        short_name: 'Nubih',
        description:
          'Crea patrones de mostacillas peyote, loom y brick, y teje guiándote paso a paso — todo en tu dispositivo, sin necesidad de conexión a internet.',
        lang: 'es-CL',
        display: 'standalone',
        start_url: '/',
        // Brand teal for the installed app's title bar/status bar; light canvas
        // for the splash screen background shown while the app boots.
        theme_color: '#2f5b66',
        background_color: '#fbfafc',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Same two files double as maskable: resources/icon.png already keeps
          // the logo well inside the safe zone (full-bleed gold background,
          // teal roundel centered with ~14% margin per side), so no separate
          // padded variant is needed.
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Social-preview image: only ever fetched by link-unfurling crawlers
        // (Facebook, Twitter/X, Slack...), never by the app itself — no
        // reason to spend offline precache budget on it.
        globIgnores: ['og-image.png'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
