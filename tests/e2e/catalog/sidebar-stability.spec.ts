import { expect, test, type Browser } from '@playwright/test'
import { shiftTotal, watchShifts } from '../support/layout-shifts'

// The desktop sidebar keeps still when its filters arrive (Plan 5 Task 8 fix round). The panel
// renders from lg after hydration; until then the server's static outline stands in
// (FilterPanelSkeleton). It must be as tall as the panel, or the page below the aside moves: an
// empty filtered listing's footer moved, a CLS of 0.0101 at 1440x900. Read only, desktop only.

const EMPTY = '/product-category/digital/mobile-phone/?min_price=1&max_price=2'
const PAGES = [
  '/product-category/digital/mobile-phone/',
  '/product/list/',
  '/brand/samsung/',
  EMPTY,
]

/** The aside's content height (its own scroll height: the aside is capped at a screen). */
const asideHeight = (browser: Browser, path: string, javaScriptEnabled: boolean) =>
  (async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled,
    })
    try {
      const page = await context.newPage()
      await page.goto(path)
      const aside = page.locator('aside[aria-labelledby]')
      if (javaScriptEnabled) {
        // The panel in the outline's place.
        await expect(aside.locator('h3 button').first()).toBeVisible()
        await expect(aside.locator('[data-filter-skeleton]')).toHaveCount(0)
      } else {
        await expect(aside.locator('[data-filter-skeleton]')).toHaveCount(1)
      }
      return await aside.evaluate((element) => element.scrollHeight)
    } finally {
      await context.close()
    }
  })()

test.describe('the desktop sidebar keeps still while its filters arrive', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the sidebar shows from lg (desktop project)')
  })

  for (const path of PAGES) {
    test(`the outline is as tall as the panel: ${path}`, async ({ browser }) => {
      const outline = await asideHeight(browser, path, false)
      const panel = await asideHeight(browser, path, true)
      console.log(`[sidebar] ${path}: outline ${outline}px, panel ${panel}px`)
      expect(
        Math.abs(outline - panel),
        `${path}: outline ${outline}, panel ${panel}`,
      ).toBeLessThanOrEqual(1)
    })
  }

  test('an empty filtered listing: CLS under 0.001 at 1440x900', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    try {
      const page = await context.newPage()
      await watchShifts(page)
      await page.goto(EMPTY)
      await expect(page.locator('aside[aria-labelledby] h3 button').first()).toBeVisible()
      const cls = await shiftTotal(page)
      console.log(`[cls] empty filtered listing desktop: ${cls.toFixed(4)}`)
      expect(cls).toBeLessThan(0.001)
    } finally {
      await context.close()
    }
  })
})
