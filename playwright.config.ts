import { defineConfig, devices } from '@playwright/test'

const BASE = 'http://localhost:4173/health-checkin-app-v2/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    // Storage is per-origin, so every test file starts from an empty IndexedDB.
    trace: 'off',
  },
  projects: [
    // iPhone-sized portrait is the primary device, so it goes first.
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'macbook', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: BASE,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
