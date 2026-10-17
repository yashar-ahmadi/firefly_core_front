import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// The preinstalled Chromium may be older than the one this Playwright version expects.
// Point at it explicitly when it exists (override with PLAYWRIGHT_CHROMIUM_PATH).
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const launchOptions = existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}

const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
/** Specs of the `journeys` project only. */
const JOURNEYS = /\/account\/(?:auth|account)\.spec\.ts$/

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
    { name: 'mobile', testIgnore: JOURNEYS, use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      testIgnore: JOURNEYS,
      // The iPad descriptor defaults to WebKit; only Chromium is available here.
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
    },
    { name: 'desktop', testIgnore: JOURNEYS, use: DESKTOP },
    {
      // The journeys that log in through the form or write sara's data (tests/e2e/account/
      // auth.spec.ts, account.spec.ts): on a desktop, one at a time, after every other project
      // (no read-only spec is looking at her address book, wishlist or cart while they change, and
      // their logins come apart from the others'). Skipped when a project before them failed.
      name: 'journeys',
      testMatch: JOURNEYS,
      dependencies: ['mobile', 'tablet', 'desktop'],
      workers: 1,
      use: DESKTOP,
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
