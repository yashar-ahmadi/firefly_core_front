import {
  devices,
  expect,
  type Browser,
  type BrowserContextOptions,
  type FullProject,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { gzipSync } from 'node:zlib'
import {
  checkoutReached,
  leaveCheckout,
  prepareCheckout,
  type CheckoutState,
} from './checkout-states'
import { SAMPLE, seedCompare } from './compare-seed'
import { SESSION_COOKIES } from './session'

// The JavaScript budget's measure (ruling P2-R4; docs/ARCHITECTURE.md, Performance): at most
// 250 KB gzip per route, measured as the browser loads the production build, with no
// interaction. Every /_next/static/**/*.js the page requests until it settles counts, each
// compressed with gzip -9. Settled: after `load`, no /_next/static request has been in flight
// for QUIET_MS (network-idle style, limited to the app's own assets; at most SETTLE_LIMIT_MS).
// `noModule` polyfills are never requested by a modern browser, so they do not count; code
// that loads on first use (a panel, a menu, a toast, the phone search overlay) does not either.
// Used by catalog/budget.spec.ts (a guest) and catalog/budget-signed-in.spec.ts (sara), in the
// `desktop` project and again in `budget-push` (the same build as a shop with web push: dummy
// FIREBASE_* on its own server, playwright.config.ts). The checkout's states are set up and
// checked by support/checkout-states.ts.

/** The session's flag cookie (`ff_auth`): there while the session lives. */
const FLAG_COOKIE = SESSION_COOKIES[2]

export interface BudgetRoute {
  name: string
  path: string
  checkout?: CheckoutState
}

export const BUDGET_KB = 250
/**
 * The checkout's own target in every state it is measured in (Task 3's amendment): below the
 * route budget, the headroom kept for the order's payment resume (Plan 4 Task 4).
 */
export const CHECKOUT_BUDGET_KB = 246

/** The figure a route is held to. */
export const budgetOf = (route: BudgetRoute) => (route.checkout ? CHECKOUT_BUDGET_KB : BUDGET_KB)

/** Whether `project` measures the budget: `desktop`, and `budget-push` for a push shop. */
export function measuresBudget(project: FullProject): boolean {
  return project.name === 'desktop' || project.metadata.pushShop === true
}

/** Names the device and the shop a figure is for: `desktop`, `phone, signed in, push shop`. */
export function deviceLabel(project: FullProject, device: string): string {
  return project.metadata.pushShop === true ? `${device}, push shop` : device
}

/** Whether `project` is the push shop's (dummy FIREBASE_*: `budget-push`). */
export function pushShop(project: FullProject): boolean {
  return project.metadata.pushShop === true
}

/**
 * Web push on in this browser, as `push-storage.ts` keeps it, for the costliest signed-in page of
 * a push shop: the re-register effect's chunk loads. Kept for another account, so the effect
 * forgets it once it has read the profile, and never calls the API (device calls are refused
 * anyway).
 */
async function pushOn(page: Page): Promise<void> {
  await page.route('**/api/bff/devices/**', (route) => route.abort())
  await page.addInitScript(() => {
    const state = { token: 'e2e-budget-token', owner: 'e2e-budget-owner', checkedAt: Date.now() }
    localStorage.setItem('ff_push', JSON.stringify(state))
  })
}
const QUIET_MS = 1000
const SETTLE_LIMIT_MS = 15_000
export const PHONE = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }

const STATIC = /\/_next\/static\//
const SCRIPT = /\/_next\/static\/.+\.js$/

type Body = { url: string; ok: true; bytes: Buffer } | { url: string; ok: false; error: string }

/**
 * Records every script response's body, and when the app's static assets last moved. Each body
 * promise settles to a result (never rejects), so a failed read is reported, not left unhandled.
 */
function recordScripts(page: Page) {
  const bodies = new Map<string, Promise<Body>>()
  let inFlight = 0
  let lastActivity = Date.now()
  const moved = () => (lastActivity = Date.now())
  page.on('request', (request) => {
    if (!STATIC.test(request.url())) return
    inFlight += 1
    moved()
  })
  const done = (request: { url: () => string }) => {
    if (!STATIC.test(request.url())) return
    inFlight -= 1
    moved()
  }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  page.on('response', (response) => {
    const url = response.url().split('?')[0]!
    if (!SCRIPT.test(url) || bodies.has(url)) return
    bodies.set(
      url,
      response.body().then(
        (bytes): Body => ({ url, ok: true, bytes }),
        (error: unknown): Body => ({ url, ok: false, error: String(error) }),
      ),
    )
  })
  return {
    bodies,
    settled: () => inFlight === 0 && Date.now() - lastActivity >= QUIET_MS,
  }
}

interface Measure {
  kb: number
  budget: number
  line: string
}

export interface MeasureOptions {
  /** Signed in: the session must still be there once the page has loaded. */
  signedIn?: boolean
  /** Web push on in this browser (`pushOn`). */
  push?: boolean
}

/**
 * Loads `route` in `page` and sums its scripts, gzipped, once /_next/static has gone quiet. The
 * page measured must be the route itself (not a redirect to login), and with `signedIn` the
 * session must have held (the flag cookie still there), so a lost session never measures the
 * guest's page instead.
 */
export async function measure(
  page: Page,
  route: BudgetRoute,
  device: string,
  { signedIn = false, push = false }: MeasureOptions = {},
): Promise<Measure> {
  if (route.name === 'compare') await seedCompare(page, [SAMPLE.S25, SAMPLE.A56])
  if (route.checkout) await prepareCheckout(page, route.checkout)
  if (push) await pushOn(page)
  const scripts = recordScripts(page)

  const response = await page.goto(route.path, { waitUntil: 'load' })
  expect(response?.status(), `${device} ${route.path}`).toBe(200)
  expect(new URL(page.url()).pathname, `${device}: the page measured`).toBe(
    new URL(route.path, page.url()).pathname,
  )
  if (signedIn) {
    const cookies = await page.context().cookies()
    expect(
      cookies.map(({ name }) => name),
      `${device}: still signed in`,
    ).toContain(FLAG_COOKIE)
  }
  if (route.checkout) await checkoutReached(page, route.checkout, device)
  await expect
    .poll(scripts.settled, {
      message: `${device}: /_next/static never went quiet for ${QUIET_MS} ms after load`,
      timeout: SETTLE_LIMIT_MS,
      intervals: [100],
    })
    .toBe(true)

  const results = await Promise.all(scripts.bodies.values())
  const unreadable = results.flatMap((result) =>
    result.ok ? [] : [`${result.url}: ${result.error}`],
  )
  expect(unreadable, `${device}: script bodies that could not be read`).toEqual([])
  expect(results.length, `${device}: scripts were recorded`).toBeGreaterThan(0)
  let bytes = 0
  for (const result of results) if (result.ok) bytes += gzipSync(result.bytes, { level: 9 }).length
  if (route.checkout) await leaveCheckout(page, route.checkout)
  const kb = bytes / 1024
  const budget = budgetOf(route)
  const state = route.checkout ? ` [${route.checkout}]` : ''
  const line = `${route.name} (${device})${state} ${decodeURIComponent(route.path)}: ${kb.toFixed(1)} KB gzip in ${results.length} scripts (budget ${budget} KB)`
  return { kb, budget, line }
}

/**
 * The same route on a phone, in a fresh context (no cache, no state shared with the desktop),
 * with `options` (a session's storage state) on top of the Pixel 7's; `device` names it.
 */
export async function measurePhone(
  browser: Browser,
  route: BudgetRoute,
  {
    device = 'phone',
    signedIn = false,
    push = false,
    ...options
  }: BrowserContextOptions & MeasureOptions & { device?: string } = {},
) {
  const context = await browser.newContext({ ...PHONE, ...options })
  try {
    return await measure(await context.newPage(), route, device, { signedIn, push })
  } finally {
    await context.close()
  }
}

/** Prints both figures, keeps them as the test's annotations, and holds each to the budget. */
export function enforce(info: TestInfo, ...figures: Measure[]): void {
  for (const { line } of figures) {
    console.log(`[js-budget] ${line}`)
    info.annotations.push({ type: 'js-budget', description: line })
  }
  for (const { kb, budget, line } of figures) expect.soft(kb, line).toBeLessThanOrEqual(budget)
}
