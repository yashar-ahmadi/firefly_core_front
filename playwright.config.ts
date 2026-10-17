import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
/**
 * The same build as a shop with web push: a second server with dummy FIREBASE_* values (the
 * config is read at runtime), for the JS budget of push shops (the `budget-push` project).
 */
const pushBaseURL = process.env.E2E_PUSH_BASE_URL ?? 'http://localhost:3001'

// The preinstalled Chromium may be older than the one this Playwright version expects.
// Point at it explicitly when it exists (override with PLAYWRIGHT_CHROMIUM_PATH).
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const launchOptions = existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}

const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
/** Specs of the `journeys` project only. */
const JOURNEYS = /\/account\/(?:auth|account)\.spec\.ts$/
/** The JS budget's specs: the `desktop` project measures them, and `budget-push` again. */
const BUDGET = /\/catalog\/budget(?:-signed-in)?\.spec\.ts$/

/** What both servers run with (the dev backend's key gate is off, so any key works). */
function serverEnv(url: string): Record<string, string> {
  const { hostname, port } = new URL(url)
  return {
    FIREFLY_API_URL: 'http://localhost:8000',
    // Production requires a key; the dev backend's key gate is off, so any value works.
    FIREFLY_API_KEY: process.env.FIREFLY_API_KEY ?? 'e2e-dev-key',
    SITE_URL: url,
    PORT: port || '3000',
    // server.js listens on HOSTNAME; some shells export the machine name under that variable.
    HOSTNAME: hostname,
  }
}

/** Shaped like a Firebase web config, valid for nothing: no request ever reaches Firebase. */
const DUMMY_FIREBASE = {
  FIREBASE_API_KEY: 'e2e-dummy-api-key',
  FIREBASE_PROJECT_ID: 'e2e-dummy-project',
  FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  FIREBASE_APP_ID: '1:000000000000:web:e2edummy',
  FIREBASE_VAPID_KEY: 'e2e-dummy-vapid-key',
}

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
      // The JS budget again, on the push shop's server (dummy FIREBASE_*): the guest's catalog
      // must not pay for web push, nor a signed-in visitor without it on. Signed in through the
      // desktop project's shared session (one login for both: `metadata.session`).
      name: 'budget-push',
      testMatch: BUDGET,
      use: { ...DESKTOP, baseURL: pushBaseURL },
      metadata: { session: 'desktop', pushShop: true },
    },
    {
      // The journeys that log in through the form or write sara's data (tests/e2e/account/
      // auth.spec.ts, account.spec.ts): on a desktop, one at a time, after every other project
      // (no read-only spec is looking at her address book, wishlist or cart while they change, and
      // their logins come apart from the others'). Skipped when a project before them failed;
      // `pnpm test:e2e:journeys` runs them alone. A control that is not there fails in 10 s, as
      // an assertion would, long before the test's own timeout (the `sara` guard restores her data
      // either way).
      name: 'journeys',
      testMatch: JOURNEYS,
      dependencies: ['mobile', 'tablet', 'desktop'],
      workers: 1,
      use: { ...DESKTOP, actionTimeout: 10_000, navigationTimeout: 20_000 },
    },
  ],
  // The production artifact, as the Docker image runs it: the standalone server.js with
  // .next/static and public copied next to it (scripts/start-standalone.mjs). Started one after
  // the other: the push shop's server runs the build the first one made.
  webServer: [
    {
      command: 'pnpm build && pnpm start:standalone',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 300_000,
      env: serverEnv(baseURL),
    },
    {
      command: 'pnpm start:standalone',
      url: pushBaseURL,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { ...serverEnv(pushBaseURL), ...DUMMY_FIREBASE },
    },
  ],
})
