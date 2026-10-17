import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { SAMPLE, seedCompare } from '../support/compare-seed'

// The JavaScript budget of the catalog (ruling P2-R4; docs/ARCHITECTURE.md, Performance): at
// most 250 KB gzip per route, measured as the browser loads the production build, with no
// interaction. Every /_next/static/**/*.js the page requests until it settles counts, each
// compressed with gzip -9. Settled: after `load`, no /_next/static request has been in flight
// for QUIET_MS (network-idle style, limited to the app's own assets; at most SETTLE_LIMIT_MS).
// `noModule` polyfills are never requested by a modern browser, so they do not count; code
// that loads on first use (a panel, a menu, a toast, the phone search overlay) does not either.
// Each route is measured twice and both figures are printed and enforced: on a desktop (this
// project's page, 1440 px) and on a phone (a fresh context: Pixel 7 at 375 px, touch and a
// mobile user agent), where code may load for touch phones only. Runs in the desktop project
// only, which measures both.

const BUDGET_KB = 250
const QUIET_MS = 1000
const SETTLE_LIMIT_MS = 15_000
const PHONE = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }

const ROUTES: { name: string; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'list', path: '/product/list/flagship-phones/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  // Every search request is logged by the backend: two loads per run (desktop and phone).
  { name: 'search', path: `/search/?q=${encodeURIComponent('گوشی')}` },
  { name: 'compare', path: '/compare/' },
  { name: 'brand', path: '/brand/samsung/' },
  { name: 'brands', path: '/brand/' },
  // Plan 3: the sign-in code lives on this route alone (none of it on the catalog's).
  { name: 'login', path: '/login/' },
]

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

/** Loads `route` in `page` and sums its scripts, gzipped, once /_next/static has gone quiet. */
async function measure(
  page: Page,
  route: { name: string; path: string },
  device: string,
): Promise<Measure> {
  if (route.name === 'compare') await seedCompare(page, [SAMPLE.S25, SAMPLE.A56])
  const scripts = recordScripts(page)

  const response = await page.goto(route.path, { waitUntil: 'load' })
  expect(response?.status(), `${device} ${route.path}`).toBe(200)
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

/** The same route on a phone, in a fresh context (no cache, no state shared with the desktop). */
async function measurePhone(browser: Browser, route: { name: string; path: string }) {
  const context = await browser.newContext(PHONE)
  try {
    return await measure(await context.newPage(), route, 'phone')
  } finally {
    await context.close()
  }
}

test.describe('JavaScript budget (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    test(`${route.name}: at most ${BUDGET_KB} KB gzip of JavaScript on desktop and phone`, async ({
      page,
      browser,
    }, info) => {
      test.skip(info.project.name !== 'desktop', 'measures both viewports itself')
      test.setTimeout(90_000)
      const desktop = await measure(page, route, 'desktop')
      const phone = await measurePhone(browser, route)
      for (const { line } of [desktop, phone]) {
        console.log(`[js-budget] ${line}`)
        info.annotations.push({ type: 'js-budget', description: line })
      }
      expect.soft(desktop.kb, desktop.line).toBeLessThanOrEqual(BUDGET_KB)
      expect.soft(phone.kb, phone.line).toBeLessThanOrEqual(BUDGET_KB)
    })
  }
})
