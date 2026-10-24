import { expect, test, type Page } from '@playwright/test'
import { cartWrite } from '../support/cart-write'
import { shellHydrated } from '../support/hydrated'

// The header's cart badge bumps when an add raises the count (spec §7.1; Plan 5 Task 8), and not
// for a visitor who asked for less motion: the badge's computed animation, read in the browser
// under both settings. Writes: this context's own guest cart (one add), cleared after.

/** A simple product (one variant, 10123) with stock to spare: the cart specs' product. */
const PRODUCT = { slug: 'nestle-coffee-gold', variant: 10123 }
const BFF = { 'X-Requested-With': 'ff' }

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/** The header cart link's badge (its count, hidden from assistive tech). */
const headerBadge = (page: Page) =>
  page
    .getByRole('banner')
    .getByRole('link', { name: /^سبد خرید/ })
    .locator('span[aria-hidden]')

async function addFromProductPage(page: Page): Promise<void> {
  await page.goto(`/product/${PRODUCT.slug}/`)
  await shellHydrated(page)
  const buy = page.getByRole('region', { name: isPhone(page) ? 'نوار خرید' : 'خرید', exact: true })
  const add = buy.getByRole('button', { name: 'افزودن به سبد خرید' })
  await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () => add.click())
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`an add bumps the cart badge (${motion === 'reduce' ? 'not with reduced motion' : 'motion allowed'})`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
    await page.emulateMedia({ reducedMotion: motion })
    try {
      await addFromProductPage(page)
      const badge = headerBadge(page)
      await expect(badge).toHaveText('۱')
      const animation = await badge.evaluate((element) => getComputedStyle(element).animationName)
      expect(animation).toBe(motion === 'reduce' ? 'none' : 'badge-bump')
      // A reload reads the same count: no add, no bump.
      await page.reload()
      await shellHydrated(page)
      await expect(headerBadge(page)).toHaveText('۱')
      expect(
        await headerBadge(page).evaluate((element) => getComputedStyle(element).animationName),
      ).toBe('none')
    } finally {
      await page.request.delete('/api/bff/cart/clear/', { headers: BFF }).catch(() => undefined)
    }
  })
}
