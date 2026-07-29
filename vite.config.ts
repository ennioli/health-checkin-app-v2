import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this project from a repository subpath. Base, manifest
// scope, and service-worker scope must all agree or the installed app breaks
// in production while working fine on the dev origin.
const BASE = '/health-checkin-app-v2/'

// Trusted local HTTPS for on-device iPhone testing. iOS only registers a
// service worker behind a certificate it trusts, so a self-signed cert is not
// enough — generate these with mkcert (see README) and the dev server picks
// them up automatically.
const certDir = resolve(import.meta.dirname, 'certs')
const keyPath = resolve(certDir, 'dev-key.pem')
const certPath = resolve(certDir, 'dev-cert.pem')
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined

export default defineConfig({
  base: BASE,
  server: { https },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', never 'autoUpdate': a new service worker must not take over
      // mid-edit and discard input the user has not submitted yet.
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Health Check-in',
        short_name: 'Check-in',
        description: '每日健康簽到：睡眠、飲食、體重、運動、心境',
        lang: 'zh-TW',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f4ef',
        theme_color: '#1f3d2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
