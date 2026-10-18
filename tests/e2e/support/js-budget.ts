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
import { RECEIVER_DRAFT_KEY } from '@/features/checkout/receiver-draft'
import { defaultOption } from '@/features/checkout/shipping-labels'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { requestCartWrite } from './cart-write'
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
// FIREBASE_* on its own server, playwright.config.ts).

/** The session's flag cookie (`ff_auth`): there while the session lives. */
const FLAG_COOKIE = SESSION_COOKIES[2]

/**
 * The checkout's states measured (Plan 4; Task 3's amendment: what visitors actually load, each
 * held to `CHECKOUT_BUDGET_KB`):
 * - `guest`: a product in this context's own cart, nothing else: the receiver step is open;
 * - `guest-review`: the same cart with Tehran as its destination and the operator's default
 *   shipping chosen (through the API), and the guest's receiver confirmed in this tab's
 *   sessionStorage: a guest back at the checkout (a reload), the review open at once;
 * - `signed-in`: sara's cart as it is, the writes the page would make by itself (the default
 *   address as the destination, the default shipping option) refused before they leave the
 *   browser: the shared account is only read;
 * - `signed-in-review`: a signed-in cart already at the review (its destination one of the
 *   account's addresses, its shipping chosen: k.yazdi's, left so by his journey,
 *   checkout/checkout-signed-in.spec.ts); the page has nothing to write, and any write is
 *   refused all the same;
 * - `signed-in-first`: the same account's first visit with a cart that has no destination: the
 *   page posts the default address and chooses the default shipping by itself (writes allowed:
 *   the journey's guard puts the cart back).
 */
export type CheckoutState =
  'guest' | 'guest-review' | 'signed-in' | 'signed-in-review' | 'signed-in-first'

export interface BudgetRoute {
  name: string
  path: string
  checkout?: CheckoutState
}

const BFF = { 'X-Requested-With': 'ff' }
/** A simple product with stock to spare (the cart's e2e product). */
const SEED_VARIANT = 10123
const CHECKOUT_WRITES = /\/api\/bff\/cart\/(?:destination|shipping\/select)\/$/

/** The step the state must show open before its scripts are summed (none: the cart decides). */
const OPEN_STEP: Partial<Record<CheckoutState, string>> = {
  guest: 'receiver',
  'guest-review': 'review',
  'signed-in-review': 'review',
}

/**
 * One line in this context's guest cart, through the cart-write guard: the dev SQLite lock's 500
 * (confirmed by the backend's log, the cart unchanged) is repeated once with a warning; any other
 * failure fails the measure.
 */
async function seedCart(page: Page): Promise<void> {
  await requestCartWrite(
    page.request,
    { method: 'POST', path: 'cart/item/add/', label: "cart/item/add/ for the checkout's measure" },
    () =>
      page.request.post('/api/bff/cart/item/add/', {
        headers: BFF,
        data: { variant: SEED_VARIANT, quantity: 1 },
      }),
  )
}

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

/**
 * A guest back at the checkout (`guest-review`): this context's cart with a product, Tehran as
 * its destination and the operator's default shipping option chosen (else the first available,
 * as a shopper would), each through the cart-write guard; and, in this tab's sessionStorage
 * before any page script runs, the receiver the guest confirmed with «ادامه».
 */
async function seedGuestReview(page: Page): Promise<void> {
  await seedCart(page)
  const tehran = (await geo<Province>(page, 'province/list/?limit=1500')).find(
    (province) => province.name === 'تهران',
  )
  expect(tehran, 'the province Tehran').toBeDefined()
  const cities = await geo<City>(page, `city/list/?province=${tehran!.id}&limit=1500`)
  const city = cities.find((item) => item.name === 'تهران') ?? cities[0]
  expect(city, "one of Tehran's cities").toBeDefined()
  await requestCartWrite(
    page.request,
    {
      method: 'POST',
      path: 'cart/destination/',
      label: "cart/destination/ for the review's measure",
    },
    () =>
      page.request.post('/api/bff/cart/destination/', {
        headers: BFF,
        data: { province: tehran!.id, city: city!.id },
      }),
  )
  const list = await page.request.get('/api/bff/cart/shipping/option/list/', { headers: BFF })
  expect(list.ok(), 'cart/shipping/option/list/').toBe(true)
  const { options } = ((await list.json()) as { data: ShippingOptionList }).data
  const option = defaultOption(options) ?? options.find((item) => item.is_available)
  expect(option, 'a shipping option for Tehran').toBeDefined()
  await requestCartWrite(
    page.request,
    {
      method: 'POST',
      path: 'cart/shipping/select/',
      label: "cart/shipping/select/ for the review's measure",
    },
    () =>
      page.request.post('/api/bff/cart/shipping/select/', {
        headers: BFF,
        data: { code: option!.code, cash_on_delivery: false },
      }),
  )
  const draft = JSON.stringify({
    values: {
      province: tehran!.id,
      city: city!.id,
      address: 'خیابان آزمون، کوچه\u{0654} یک',
      plaque: '',
      unit: '',
      postalCode: '1234567890',
      firstName: 'آزمون',
      lastName: 'بودجه',
      mobile: '09120000000',
      customerMobile: '',
    },
    confirmed: true,
  })
  await page.addInitScript(
    ([key, text]) => {
      try {
        if (sessionStorage.getItem(key!) === null) sessionStorage.setItem(key!, text!)
      } catch {
        // No storage: the measure's step check says so.
      }
    },
    [RECEIVER_DRAFT_KEY, draft],
  )
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
  if (route.checkout === 'guest') await seedCart(page)
  if (route.checkout === 'guest-review') await seedGuestReview(page)
  if (route.checkout === 'signed-in' || route.checkout === 'signed-in-review') {
    await page.route(CHECKOUT_WRITES, (write) => write.abort())
  }
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
  const step = route.checkout && OPEN_STEP[route.checkout]
  if (step) {
    await expect(
      page.locator(`section[data-step="${step}"]`),
      `${device}: the checkout's ${step} step open`,
    ).toHaveAttribute('data-state', 'active', { timeout: SETTLE_LIMIT_MS })
  }
  if (route.checkout === 'signed-in-first') {
    // The page's own writes, one after the other: until the review is open, or the shipping
    // step asks (no default option for the destination).
    await expect(
      page
        .locator('section[data-step="review"][data-state="active"]')
        .or(page.getByText('یک روش ارسال انتخاب کنید.')),
      `${device}: the checkout went as far as it goes by itself`,
    ).toBeVisible({ timeout: SETTLE_LIMIT_MS })
  }
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
  if (route.checkout === 'guest' || route.checkout === 'guest-review') {
    await page.request.delete('/api/bff/cart/clear/', { headers: BFF }).catch(() => undefined)
  }
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
