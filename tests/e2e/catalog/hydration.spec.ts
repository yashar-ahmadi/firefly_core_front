import { devices, expect, test, type Browser } from '@playwright/test'
import { SAMPLE, seedCompare } from '../support/compare-seed'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The production build hydrates every catalog page cleanly, on a phone (375) and on a desktop
// (1440): no console error at all, no «Hydration failed» and none of React's minified hydration
// errors (#418 text mismatch, #423 recoverable root error, #425 text content mismatch). Runs in
// the desktop project only; it opens both widths itself.

const PAGES = [
  '/',
  '/product-category/digital/mobile-phone/',
  '/brand/samsung/',
  '/product/list/flagship-phones/',
  '/product/list/?has_discount=true',
  '/product/samsung-galaxy-s25-ultra/',
  '/product/chips-pack-family/',
  // Every search request is logged by the backend: one term, two loads in all.
  `/search/?q=${encodeURIComponent('گوشی')}`,
  '/compare/',
  '/brand/',
  '/product/no-such-product-hydration-check/',
]

const VIEWPORTS = [
  {
    name: 'phone',
    width: 375,
    options: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
  },
  { name: 'desktop', width: 1440, options: { viewport: { width: 1440, height: 900 } } },
] as const

/** Hydration errors React or Next may log in any console channel. */
const HYDRATION = /Hydration failed|Minified React error #(?:418|423|425)\b|hydration/i

async function visit(browser: Browser, path: string, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    ...viewport.options,
    baseURL: test.info().project.use.baseURL,
  })
  // The compare page renders nothing to compare without products in the list.
  if (path === '/compare/') await seedCompare(context, [SAMPLE.S25, SAMPLE.A56])
  const page = await context.newPage()
  const errors = watchErrors(page)
  const hydration: string[] = []
  page.on('console', (message) => {
    if (HYDRATION.test(message.text())) hydration.push(`${message.type()}: ${message.text()}`)
  })
  const response = await page.goto(path)
  await shellHydrated(page)
  // The seeded products are compared side by side (read on the client, after hydration).
  if (path === '/compare/') await expect(page.getByRole('table')).toBeVisible()
  await page.waitForLoadState('load')
  // Recoverable errors are reported right after the hydration commit: give them a moment.
  await page.waitForTimeout(500)
  await context.close()
  // A 404 page's own document is logged as a failed load: that status is the expected one.
  const ownStatus = `the server responded with a status of 404 (Not Found) (${response?.url()})`
  return {
    status: response?.status(),
    errors: errors.filter((error) => !(response?.status() === 404 && error.endsWith(ownStatus))),
    hydration,
  }
}

test.describe('hydration (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const path of PAGES) {
    test(`${decodeURIComponent(path)} hydrates cleanly at 375 and 1440`, async ({ browser }) => {
      test.skip(test.info().project.name !== 'desktop', 'opens both widths itself')
      for (const viewport of VIEWPORTS) {
        const result = await visit(browser, path, viewport)
        const where = `${path} at ${viewport.width}`
        expect(result.status, where).toBe(path.includes('no-such-product') ? 404 : 200)
        expect(result.hydration, where).toEqual([])
        expect(result.errors, where).toEqual([])
      }
    })
  }
})
