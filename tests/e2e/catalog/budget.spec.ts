import { expect, test, type Page } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { SAMPLE, seedCompare } from '../support/compare-seed'

// The JavaScript budget of the catalog (ruling P2-R4; docs/ARCHITECTURE.md, Performance): at
// most 250 KB gzip per route, measured as the browser loads the production build, with no
// interaction. Every /_next/static/**/*.js the page requests until it settles counts, each
// compressed with gzip -9. Settled: after `load`, no /_next/static request has been in flight
// for QUIET_MS (network-idle style, limited to the app's own assets; at most SETTLE_LIMIT_MS).
// `noModule` polyfills are never requested by a modern browser, so they do not count; code
// that loads on first use (a panel, a menu, a toast) does not either. Runs in the desktop
// project only: the figure does not depend on the viewport.

const BUDGET_KB = 250
const QUIET_MS = 1000
const SETTLE_LIMIT_MS = 15_000

const ROUTES: { name: string; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'list', path: '/product/list/flagship-phones/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  // Every search request is logged by the backend: one load per run.
  { name: 'search', path: `/search/?q=${encodeURIComponent('گوشی')}` },
  { name: 'compare', path: '/compare/' },
  { name: 'brand', path: '/brand/samsung/' },
  { name: 'brands', path: '/brand/' },
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

test.describe('JavaScript budget (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    test(`${route.name}: at most ${BUDGET_KB} KB gzip of JavaScript`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'the figure does not depend on the viewport')
      if (route.name === 'compare') await seedCompare(page, [SAMPLE.S25, SAMPLE.A56])
      const scripts = recordScripts(page)

      const response = await page.goto(route.path, { waitUntil: 'load' })
      expect(response?.status(), route.path).toBe(200)
      await expect
        .poll(scripts.settled, {
          message: `/_next/static never went quiet for ${QUIET_MS} ms after load`,
          timeout: SETTLE_LIMIT_MS,
          intervals: [100],
        })
        .toBe(true)

      const results = await Promise.all(scripts.bodies.values())
      const unreadable = results.flatMap((result) =>
        result.ok ? [] : [`${result.url}: ${result.error}`],
      )
      expect(unreadable, 'script bodies that could not be read').toEqual([])
      let bytes = 0
      for (const result of results)
        if (result.ok) bytes += gzipSync(result.bytes, { level: 9 }).length
      const kb = bytes / 1024
      const line = `${route.name} ${decodeURIComponent(route.path)}: ${kb.toFixed(1)} KB gzip in ${results.length} scripts (budget ${BUDGET_KB} KB)`
      console.log(`[js-budget] ${line}`)
      info.annotations.push({ type: 'js-budget', description: line })
      expect(results.length, 'scripts were recorded').toBeGreaterThan(0)
      expect(kb, line).toBeLessThanOrEqual(BUDGET_KB)
    })
  }
})
