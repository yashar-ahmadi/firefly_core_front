import { expect, test } from '@playwright/test'
import { gzipSync } from 'node:zlib'

// The JavaScript budget of the catalog (ruling P2-R4; docs/ARCHITECTURE.md, Performance): at
// most 250 KB gzip per route, measured as the browser loads the production build. Every
// /_next/static/**/*.js the page requests by `load` + 3 s with no interaction counts, each
// compressed with gzip -9. `noModule` polyfills are never requested by a modern browser, so they
// do not count; code that loads on first use (a panel, a menu, a toast) does not either. Runs in
// the desktop project only: the figure does not depend on the viewport.

const BUDGET_KB = 250
const SETTLE_MS = 3000

const COMPARE = [
  { slug: 'samsung-galaxy-s25-ultra', name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' },
  { slug: 'samsung-galaxy-a56', name: 'گوشی موبایل سامسونگ گلکسی A56' },
].map((item) => ({
  ...item,
  image: 'http://localhost:8000/static/defaults/default.png',
  categoryId: 10002,
}))

const ROUTES: { name: string; path: string }[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  // Every search request is logged by the backend: one load per run.
  { name: 'search', path: `/search/?q=${encodeURIComponent('گوشی')}` },
  { name: 'compare', path: '/compare/' },
  { name: 'brand', path: '/brand/samsung/' },
]

const SCRIPT = /\/_next\/static\/.+\.js(?:\?|$)/

test.describe('JavaScript budget (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    test(`${route.name}: at most ${BUDGET_KB} KB gzip of JavaScript`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'the figure does not depend on the viewport')
      if (route.name === 'compare') {
        await page.addInitScript((list) => {
          localStorage.setItem('ff-compare', JSON.stringify({ state: { items: list }, version: 0 }))
        }, COMPARE)
      }
      const bodies = new Map<string, Promise<Buffer>>()
      page.on('response', (response) => {
        const url = response.url().split('?')[0]!
        if (!SCRIPT.test(url) || bodies.has(url)) return
        bodies.set(url, response.body())
      })

      const response = await page.goto(route.path, { waitUntil: 'load' })
      expect(response?.status(), route.path).toBe(200)
      await page.waitForTimeout(SETTLE_MS)

      let bytes = 0
      for (const body of bodies.values()) bytes += gzipSync(await body, { level: 9 }).length
      const kb = bytes / 1024
      const line = `${route.name} ${decodeURIComponent(route.path)}: ${kb.toFixed(1)} KB gzip in ${bodies.size} scripts (budget ${BUDGET_KB} KB)`
      console.log(`[js-budget] ${line}`)
      info.annotations.push({ type: 'js-budget', description: line })
      expect(bodies.size, 'scripts were recorded').toBeGreaterThan(0)
      expect(kb, line).toBeLessThanOrEqual(BUDGET_KB)
    })
  }
})
