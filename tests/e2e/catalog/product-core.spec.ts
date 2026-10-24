import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { cartWrite } from '../support/cart-write'
import { watchErrors } from '../support/watch-errors'

// The product page's buying core against the dev backend's sample data (product digest §5,
// §12): the S25 Ultra (three axes, an out-of-stock variant) and the out-of-stock chips. Plan 2
// Task 8 extends this file with the page's content sections (and may rename it product.spec.ts).

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const S25 = '/product/samsung-galaxy-s25-ultra/'
const CHIPS = '/product/chips-pack-family/'
const NAME = 'گوشی موبایل سامسونگ گلکسی S25 اولترا'
const ADD = 'افزودن به سبد خرید'
const NOTIFY = 'موجود شد خبرم کن'
/** The buy box shows from md; below it the phone's buy bar does the adding. */
const MD = 768

const VALUE = { black: 10001, silver: 10003, gb512: 10016 }

interface LiveVariant {
  id: number
  attribute_value_ids: number[]
  final_price: number
}

interface LiveProduct {
  default_variant_id: number
  variants: LiveVariant[]
  gallery: unknown[]
}

async function liveS25(request: APIRequestContext): Promise<LiveProduct> {
  const res = await request.get(`${API_URL}/api/v1/product/detail/samsung-galaxy-s25-ultra/`)
  expect(res.ok(), 'the S25 Ultra from the backend').toBe(true)
  return ((await res.json()) as { data: LiveProduct }).data
}

const toman = (amount: number) => new Intl.NumberFormat('fa-IR').format(amount)
const digits = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n)
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < MD
const buyBox = (page: Page) => page.getByRole('region', { name: 'خرید', exact: true })
const buyBar = (page: Page) => page.getByRole('region', { name: 'نوار خرید' })
const axis = (page: Page, name: string) => page.getByRole('radiogroup', { name })
/** Includes a hidden one, so `toBeHidden` checks the element rather than its absence. */
const bottomNav = (page: Page) => page.locator('nav[data-bottom-nav]')

test.describe('product page', () => {
  test('shows the name, a price in Toman and the colour axis, and hydrates cleanly', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto(S25)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible()
    await expect(buyBox(page).getByText('تومان')).toBeVisible()
    const colours = axis(page, 'رنگ')
    await expect(colours.getByRole('radio')).toHaveCount(3)
    await expect(colours.getByRole('radio', { name: /^مشکی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // The product can be bought: no back-in-stock form.
    await expect(page.getByRole('form', { name: NOTIFY })).toHaveCount(0)
    await expect(page).toHaveTitle(`${NAME} | فروشگاه فایرفلای`)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('another storage shows its own price, and a shared link opens that variant', async ({
    page,
    request,
  }) => {
    const live = await liveS25(request)
    const chosen = live.variants.find(
      (v) =>
        v.attribute_value_ids.includes(VALUE.black) && v.attribute_value_ids.includes(VALUE.gb512),
    )
    expect(chosen, 'black, 512 GB in the sample data').toBeDefined()
    await page.goto(S25)
    const storage = axis(page, 'حافظه داخلی')
    await storage.getByRole('radio', { name: /^۵۱۲/ }).click()
    await expect(buyBox(page).getByText(toman(chosen!.final_price), { exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]variant=${chosen!.id}(?:&|$)`))

    await page.reload()
    await expect(axis(page, 'حافظه داخلی').getByRole('radio', { name: /^۵۱۲/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(buyBox(page).getByText(toman(chosen!.final_price), { exact: true })).toBeVisible()
  })

  test('Back and then Forward come back to the chosen variant', async ({ page }) => {
    await page.goto('/product/list/flagship-phones/')
    await page.getByRole('link', { name: /S25/ }).first().click()
    await page.waitForURL(new RegExp(S25))
    await axis(page, 'رنگ')
      .getByRole('radio', { name: /^طلایی/ })
      .click()
    await expect(page).toHaveURL(/[?&]variant=10003(?:&|$)/)
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'گوشی های پرچمدار' })).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/[?&]variant=10003(?:&|$)/)
    await expect(axis(page, 'رنگ').getByRole('radio', { name: /^طلایی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('an out-of-stock variant cannot be bought while the others can (no notify form)', async ({
    page,
  }) => {
    await page.goto(S25)
    // Silver exists only as silver, 1 TB, which is out of stock: the picker moves there.
    await axis(page, 'رنگ')
      .getByRole('radio', { name: /^نقره ای/ })
      .click()
    await expect(
      axis(page, 'حافظه داخلی').getByRole('radio', { name: /^۱ ترابایت/ }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(buyBox(page).getByRole('button', { name: 'ناموجود' })).toBeDisabled()
    await expect(buyBox(page).getByRole('button', { name: 'خرید فوری' })).toBeDisabled()
    await expect(page.getByRole('form', { name: NOTIFY })).toHaveCount(0)
  })

  test('adding to the cart updates the cart badge', async ({ page, request }) => {
    // The page opens on the default variant: that is the line to remove afterwards.
    const added = (await liveS25(request)).default_variant_id
    await page.goto(S25)
    const cart = page.getByRole('banner').getByRole('link', { name: /^سبد خرید/ })
    await expect(cart).toHaveAccessibleName('سبد خرید')
    const add = isPhone(page)
      ? buyBar(page).getByRole('button', { name: ADD })
      : buyBox(page).getByRole('button', { name: ADD })
    try {
      // (The dev SQLite «database is locked» is retried once, logged: support/cart-write.ts.)
      await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () =>
        add.click(),
      )
      await expect(cart).toHaveAccessibleName(`سبد خرید، ${digits(1)} کالا`)
    } finally {
      // Give the stock hold back to the shared dev backend.
      await page.request.delete(`/api/bff/cart/item/${added}/remove/`, {
        headers: { 'X-Requested-With': 'ff' },
      })
    }
  })

  test('the lightbox opens on the main image, pages with the keys and closes back to it', async ({
    page,
    request,
  }) => {
    const count = 1 + (await liveS25(request)).gallery.length
    await page.goto(S25)
    const opener = page.getByRole('region', { name: 'تصاویر محصول' }).getByRole('button').first()
    await opener.click()
    const dialog = page.getByRole('dialog', { name: NAME })
    await expect(dialog.getByText(`${digits(1)} از ${digits(count)}`)).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByText(`${digits(2)} از ${digits(count)}`)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('phones get the buy bar in place of the bottom navigation, until they leave', async ({
    page,
  }) => {
    test.skip(!isPhone(page), 'the bar is for phones (below md)')
    await page.goto(S25)
    await expect(buyBar(page).getByRole('button', { name: ADD })).toBeVisible()
    // In the page, hidden by CSS (not left out by the URL).
    await expect(bottomNav(page)).toHaveCount(1)
    await expect(bottomNav(page)).toBeHidden()
    // A client-side move to a listing unmounts the bar: the navigation is back.
    await page
      .getByRole('navigation', { name: 'مسیر صفحه' })
      .getByRole('link', { name: 'گوشی موبایل' })
      .click()
    await expect(page).toHaveURL(/\/product-category\/digital\/mobile-phone\/$/)
    await expect(bottomNav(page)).toBeVisible()
    await expect(buyBar(page)).toHaveCount(0)
  })

  test('carries its SEO head: canonical, the product image and both JSON-LD blocks', async ({
    page,
  }) => {
    await page.goto(`${S25}?variant=10002`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `http://localhost:3000${S25}`,
    )
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    // The dev backend flips between real and placeholder product images (product digest §1.5):
    // a real one is shared on a large card, a placeholder is no picture (small card).
    const image = page.locator('meta[property="og:image"]')
    const card = page.locator('meta[name="twitter:card"]')
    if ((await image.count()) > 0) {
      await expect(image).toHaveAttribute('content', /^http:\/\/localhost:8000\/media\//)
      await expect(card).toHaveAttribute('content', 'summary_large_image')
    } else {
      await expect(card).toHaveAttribute('content', 'summary')
    }
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const types = blocks.map((text) => (JSON.parse(text) as { '@type': string })['@type'])
    expect(types).toEqual(['Product', 'BreadcrumbList'])
  })
})

test.describe('product page status and stock', () => {
  test('an unknown product answers 404 with a not-found title', async ({ page }) => {
    const response = await page.goto('/product/does-not-exist/')
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/^صفحه پیدا نشد \|/)
  })

  test('a missing product keeps the bottom navigation on a 375px phone (no buy bar there)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/product/does-not-exist/')
    await expect(bottomNav(page)).toBeVisible()
    await expect(buyBar(page)).toHaveCount(0)
  })

  test('an out-of-stock product offers the back-in-stock form', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(CHIPS)
    const form = page.getByRole('form', { name: NOTIFY })
    await expect(form).toBeVisible()
    await expect(form.getByRole('textbox', { name: /شمارهٔ موبایل/ })).toBeVisible()
    await expect(buyBox(page).getByRole('button', { name: 'ناموجود' })).toBeDisabled()
    if (isPhone(page)) {
      await buyBar(page).getByRole('link', { name: NOTIFY }).click()
      await expect(form).toBeInViewport()
    }
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })
})

test.describe('product page server HTML on a phone', () => {
  // Before any script runs: the navigation is already hidden by CSS, so it never flashes.
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })

  test('hides the bottom navigation behind the buy bar from the first paint', async ({ page }) => {
    await page.goto(S25)
    await expect(buyBar(page)).toBeVisible()
    // In the page, hidden by CSS (not left out by the URL).
    await expect(bottomNav(page)).toHaveCount(1)
    await expect(bottomNav(page)).toBeHidden()
  })
})
