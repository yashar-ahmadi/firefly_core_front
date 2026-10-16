import { devices, expect, test, type Browser, type Page } from '@playwright/test'
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

/** Two products for the compare page (it renders nothing to compare without them). */
const COMPARE = [
  { slug: 'samsung-galaxy-s25-ultra', name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' },
  { slug: 'samsung-galaxy-a56', name: 'گوشی موبایل سامسونگ گلکسی A56' },
].map((item) => ({
  ...item,
  image: 'http://localhost:8000/static/defaults/default.png',
  categoryId: 10002,
}))

/**
 * Resolves once the shell has hydrated: below md the header's search field becomes a read-only
 * trigger, from md the cart icon becomes a button that opens the mini-cart.
 */
async function hydrated(page: Page, width: number) {
  const banner = page.getByRole('banner')
  if (width < 768) {
    await expect(banner.getByRole('searchbox', { name: 'جستجو' })).toHaveAttribute('readonly', '')
  } else {
    await expect(banner.getByRole('link', { name: /^سبد خرید/ })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    )
  }
}

async function visit(browser: Browser, path: string, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    ...viewport.options,
    baseURL: test.info().project.use.baseURL,
  })
  if (path === '/compare/') {
    await context.addInitScript((list) => {
      localStorage.setItem('ff-compare', JSON.stringify({ state: { items: list }, version: 0 }))
    }, COMPARE)
  }
  const page = await context.newPage()
  const errors = watchErrors(page)
  const hydration: string[] = []
  page.on('console', (message) => {
    if (HYDRATION.test(message.text())) hydration.push(`${message.type()}: ${message.text()}`)
  })
  const response = await page.goto(path)
  await hydrated(page, viewport.width)
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
