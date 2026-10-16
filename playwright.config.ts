import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// The preinstalled Chromium may be older than the one this Playwright version expects.
// Point at it explicitly when it exists (override with PLAYWRIGHT_CHROMIUM_PATH).
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const launchOptions = existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  // Stops the run with one clear message when the backend's anonymous budget is used up (429).
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      // The iPad descriptor defaults to WebKit; only Chromium is available here.
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // The production artifact, as the Docker image runs it: the standalone server.js with
  // .next/static and public copied next to it (scripts/start-standalone.mjs).
  webServer: {
    command: 'pnpm build && pnpm start:standalone',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      FIREFLY_API_URL: 'http://localhost:8000',
      // Production requires a key; the dev backend's key gate is off, so any value works.
      FIREFLY_API_KEY: process.env.FIREFLY_API_KEY ?? 'e2e-dev-key',
      SITE_URL: 'http://localhost:3000',
      PORT: new URL(baseURL).port || '3000',
      // server.js listens on HOSTNAME; some shells export the machine name under that variable.
      HOSTNAME: new URL(baseURL).hostname,
    },
  },
})
