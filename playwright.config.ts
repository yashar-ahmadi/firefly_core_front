import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
/**
 * The same build as a shop with web push and the PWA: a second server with dummy FIREBASE_*
 * values and FEATURE_PWA on (the config is read at runtime), for the JS budget of push shops
 * with the PWA's service worker registered (the `budget-push` project) and the PWA's own specs
 * (the `pwa` project). The main server runs with FEATURE_PWA off: no service worker answers its
 * pages' requests, so every other spec's routes and mocks see the page's own.
 */
const pushBaseURL = process.env.E2E_PUSH_BASE_URL ?? 'http://localhost:3001'

// The preinstalled Chromium may be older than the one this Playwright version expects.
// Point at it explicitly when it exists (override with PLAYWRIGHT_CHROMIUM_PATH).
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const launchOptions = existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}

const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
/** Specs of the `journeys` project only. */
const JOURNEYS =
  /\/(?:account\/(?:auth|account|orders-journey|wallet-journey)|checkout\/(?:checkout-(?:signed-in(?:-stability)?|place)|pay-link|card-transfer|guest-cod|user-wallet)|blog\/reading-list)\.spec\.ts$/
/** The JS budget's specs: the `desktop` project measures them, and `budget-push` again. */
const BUDGET = /\/catalog\/budget(?:-signed-in)?\.spec\.ts$/
/** The PWA's specs (`pwa.spec.ts`, `pwa-<topic>.spec.ts`): the `pwa` project only, FEATURE_PWA on. */
const PWA = /\/pwa(?:-[a-z]+)?\.spec\.ts$/
/** The other specs whose `@worker` tests run again with the worker in control (`pwa-journeys`). */
const WORKER_SUBSET =
  /\/(?:checkout\/(?:checkout-shipping|payment-result)|account\/dashboard|snippets)\.spec\.ts$/

/** What both servers run with (the dev backend's key gate is off, so any key works). */
function serverEnv(url: string, { pwa }: { pwa: boolean }): Record<string, string> {
  const { hostname, port } = new URL(url)
  return {
    FIREFLY_API_URL: 'http://localhost:8000',
    // Production requires a key; the dev backend's key gate is off, so any value works.
    FIREFLY_API_KEY: process.env.FIREFLY_API_KEY ?? 'e2e-dev-key',
    SITE_URL: url,
    PORT: port || '3000',
    // server.js listens on HOSTNAME; some shells export the machine name under that variable.
    HOSTNAME: hostname,
    // On by default in production; set either way here (see `pushBaseURL`).
    FEATURE_PWA: pwa ? '1' : '0',
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
    { name: 'mobile', testIgnore: [JOURNEYS, PWA], use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      testIgnore: [JOURNEYS, PWA],
      // The iPad descriptor defaults to WebKit; only Chromium is available here.
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
    },
    { name: 'desktop', testIgnore: [JOURNEYS, PWA], use: DESKTOP },
    {
      // The PWA (Plan 5 Task 6): the manifest, the service worker's registration and offline
      // pages, the install prompt; on a desktop, on the server with FEATURE_PWA on (the push
      // shop's: both share the one worker). Signed in through the desktop project's shared
      // session (no login of its own).
      name: 'pwa',
      testMatch: PWA,
      use: { ...DESKTOP, baseURL: pushBaseURL },
      metadata: { session: 'desktop' },
    },
    {
      // A few journeys of other specs again under the PWA's worker (the main server runs with
      // FEATURE_PWA off, so they otherwise never meet it): a guest's checkout up to the review,
      // sara's dashboard (read only, the desktop project's session), a payment link's page and the
      // bank's return page; their tests tagged `@worker` (support/pwa.ts `workerInControl` puts the
      // worker in control first). Read only but for the guest's own cart, cleared after.
      name: 'pwa-journeys',
      testMatch: WORKER_SUBSET,
      grep: /@worker/,
      use: { ...DESKTOP, baseURL: pushBaseURL },
      metadata: { session: 'desktop' },
    },
    {
      // The JS budget again, on the push shop's server (dummy FIREBASE_*, FEATURE_PWA on): the
      // guest's catalog must not pay for web push, nor a signed-in visitor without it on, and the
      // PWA's registration and install prompt cost nothing on arrival. Signed in through the
      // desktop project's shared session (one login for both: `metadata.session`).
      name: 'budget-push',
      testMatch: BUDGET,
      use: { ...DESKTOP, baseURL: pushBaseURL },
      metadata: { session: 'desktop', pushShop: true },
    },
    {
      // The journeys that log in through the form or write sara's data (tests/e2e/account/
      // auth.spec.ts, account.spec.ts) or k.yazdi's (tests/e2e/checkout/checkout-signed-in.spec.ts:
      // an order of his placed through the checkout; tests/e2e/account/orders-journey.spec.ts: one
      // placed, cancelled and bought again; both cancelled by his guard; ruling P4-R4) or shirin's
      // (tests/e2e/account/wallet-journey.spec.ts: a top-up the dev bank refuses, one withdrawal
      // requested and cancelled; orders-journey.spec.ts: her delivered order bought again, her cart
      // put back; tests/e2e/checkout/user-wallet.spec.ts: a wallet-paid order, opt-in;
      // tests/e2e/blog/reading-list.spec.ts: a post saved and removed, her list put back), or place a
      // guest's order (tests/e2e/checkout/checkout-place.spec.ts, pay-link.spec.ts,
      // card-transfer.spec.ts and guest-cod.spec.ts, cancelled after by the `orders` guard; the
      // card transfer's live receipt opt-in): on a desktop,
      // one at a time, after every other project (no read-only spec is looking at her address
      // book, wishlist or cart while they change, and their logins come apart from the
      // others'). Skipped when a project before them failed;
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
  // the other: the push shop's server runs the build the first one made. Each server runs from
  // its own copy of that build, complete before it starts (scripts/standalone-instance.mjs), so
  // neither start touches the files the other serves; the global setup stops the run when a
  // reused server serves an earlier build (support/server-build.ts).
  webServer: [
    {
      command: 'pnpm build && pnpm start:standalone',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 300_000,
      env: serverEnv(baseURL, { pwa: false }),
    },
    {
      command: 'pnpm start:standalone',
      url: pushBaseURL,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { ...serverEnv(pushBaseURL, { pwa: true }), ...DUMMY_FIREBASE },
    },
  ],
})
