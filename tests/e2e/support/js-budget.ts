import {
  devices,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { SAMPLE, seedCompare } from './compare-seed'
import { SESSION_COOKIES } from './session'

// The JavaScript budget's measure (ruling P2-R4; docs/ARCHITECTURE.md, Performance): at most
// 250 KB gzip per route, measured as the browser loads the production build, with no
// interaction. Every /_next/static/**/*.js the page requests until it settles counts, each
// compressed with gzip -9. Settled: after `load`, no /_next/static request has been in flight
// for QUIET_MS (network-idle style, limited to the app's own assets; at most SETTLE_LIMIT_MS).
// `noModule` polyfills are never requested by a modern browser, so they do not count; code
// that loads on first use (a panel, a menu, a toast, the phone search overlay) does not either.
// Used by catalog/budget.spec.ts (a guest) and catalog/budget-signed-in.spec.ts (sara).

/** The session's flag cookie (`ff_auth`): there while the session lives. */
const FLAG_COOKIE = SESSION_COOKIES[2]

export interface BudgetRoute {
  name: string
  path: string
}

export const BUDGET_KB = 250
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
  line: string
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
  { signedIn = false }: { signedIn?: boolean } = {},
): Promise<Measure> {
  if (route.name === 'compare') await seedCompare(page, [SAMPLE.S25, SAMPLE.A56])
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
  const kb = bytes / 1024
  const line = `${route.name} (${device}) ${decodeURIComponent(route.path)}: ${kb.toFixed(1)} KB gzip in ${results.length} scripts (budget ${BUDGET_KB} KB)`
  return { kb, line }
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
    ...options
  }: BrowserContextOptions & { device?: string; signedIn?: boolean } = {},
) {
  const context = await browser.newContext({ ...PHONE, ...options })
  try {
    return await measure(await context.newPage(), route, device, { signedIn })
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
  for (const { kb, line } of figures) expect.soft(kb, line).toBeLessThanOrEqual(BUDGET_KB)
}
