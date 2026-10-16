import { expect, test, type Locator, type Page } from '@playwright/test'
import { watchErrors } from '../support/watch-errors'

// Quick view, comparison and recently viewed (spec §8.12, §8.3) against the dev backend's sample
// data: the phones category holds variable products (S25 Ultra, iPhone 15, Galaxy A56).

const PHONES = '/product-category/digital/mobile-phone/'
const S25 = { slug: 'samsung-galaxy-s25-ultra', name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' }
const IPHONE_15 = { slug: 'apple-iphone-15', name: 'گوشی موبایل اپل آیفون ۱۵' }
const A56 = { slug: 'samsung-galaxy-a56', name: 'گوشی موبایل سامسونگ گلکسی A56' }
const CHOOSE = 'انتخاب ویژگی\u{200C}ها'
const MD = 768

const digits = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n)
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < MD

/** The product's card in the server-rendered grid of the category's first page. */
function card(page: Page, name: string) {
  return page
    .getByRole('list', { name: 'صفحهٔ ۱' })
    .getByRole('article')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
}

const BFF_HEADERS = { 'X-Requested-With': 'ff' }

/** Whether this browser's cart has a line for the variant (never throws). */
async function cartHolds(page: Page, variant: number): Promise<boolean> {
  try {
    const response = await page.request.get('/api/bff/cart/', { headers: BFF_HEADERS })
    if (!response.ok()) return false
    const body = (await response.json()) as { data?: { lines?: { variant_id: number }[] } }
    return body.data?.lines?.some((line) => line.variant_id === variant) ?? false
  } catch {
    return false
  }
}

/** The variant quick view would add: the one its «مشاهدهٔ جزئیات کامل» link names. */
async function chosenVariant(dialog: Locator): Promise<number> {
  const href = await dialog
    .getByRole('link', { name: 'مشاهده\u{0654} جزئیات کامل' })
    .getAttribute('href')
  const id = Number(new URL(href ?? '', 'http://localhost').searchParams.get('variant'))
  expect(id, 'the details link names a variant').toBeGreaterThan(0)
  return id
}

test.describe('quick view', () => {
  test('from a category grid, «انتخاب ویژگی‌ها» opens the picker and adds the variant to the cart', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(PHONES)
    const cart = page.getByRole('banner').getByRole('link', { name: /^سبد خرید/ })
    await expect(cart).toHaveAccessibleName('سبد خرید')

    const choose = card(page, S25.name).getByRole('button', { name: CHOOSE })
    await expect(choose).toHaveAttribute('aria-haspopup', 'dialog')
    await choose.click()
    const dialog = page.getByRole('dialog', { name: S25.name })
    // On the representative variant first.
    const colours = dialog.getByRole('radiogroup', { name: 'رنگ' })
    await expect(colours.getByRole('radio', { name: /^مشکی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // Another storage: the page under it keeps its URL (quick view never writes ?variant=).
    await dialog
      .getByRole('radiogroup', { name: 'حافظه داخلی' })
      .getByRole('radio', { name: /^۵۱۲/ })
      .click()
    await expect(page).toHaveURL((url) => url.pathname === PHONES && url.search === '')

    // The line to remove afterwards: the variant on screen when adding.
    const added = await chosenVariant(dialog)
    try {
      await dialog.getByRole('button', { name: 'افزودن به سبد خرید' }).click()
      // It closes once the cart has the product, and the badge counts it.
      await expect(dialog).toBeHidden()
      await expect(cart).toHaveAccessibleName(`سبد خرید، ${digits(1)} کالا`)
      await expect(choose).toBeFocused()
    } finally {
      // Give the stock hold back to the shared dev backend, when the line is there: after a
      // failed add, a cleanup error must not hide the failure itself.
      if (await cartHolds(page, added)) {
        const removed = await page.request.delete(`/api/bff/cart/item/${added}/remove/`, {
          headers: BFF_HEADERS,
        })
        expect(removed.ok(), `variant ${added} removed from the cart`).toBe(true)
      }
    }
    expect(errors).toEqual([])
  })

  test('without JavaScript «انتخاب ویژگی‌ها» is a link to the product page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto(PHONES)
    const link = card(page, S25.name).getByRole('link', { name: CHOOSE })
    await expect(link).toHaveAttribute('href', `/product/${S25.slug}/`)
    await context.close()
  })
})

test.describe('compare', () => {
  test('two products in the list show the bar; «مقایسه» lays them side by side', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(PHONES)
    const bar = page.getByRole('region', { name: 'فهرست مقایسه' })
    await expect(bar).toHaveCount(0)

    await card(page, IPHONE_15.name).getByRole('button', { name: 'افزودن به مقایسه' }).click()
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('button', { name: /^مقایسه/ })).toBeDisabled()
    await card(page, A56.name).getByRole('button', { name: 'افزودن به مقایسه' }).click()

    if (isPhone(page)) {
      // Above the bottom navigation, never over it.
      const nav = await page.locator('nav[data-bottom-nav]').boundingBox()
      const box = await bar.boundingBox()
      expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y)
    }

    await bar.getByRole('link', { name: `مقایسه ${digits(2)} کالا` }).click()
    await expect(page).toHaveURL(/\/compare\/$/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    const table = page.getByRole('table', { name: 'مقایسه کالاها' })
    await expect(table.getByRole('link', { name: IPHONE_15.name })).toBeVisible()
    await expect(table.getByRole('link', { name: A56.name })).toBeVisible()
    // The bar is not shown on the compare page itself.
    await expect(bar).toHaveCount(0)

    // Both list the same storages: «فقط تفاوت‌ها» hides that row and keeps the colours.
    const storage = table.getByRole('row', { name: /^حافظه داخلی/ })
    await expect(storage).toBeVisible()
    await page.getByRole('switch', { name: 'فقط تفاوت\u{200C}ها' }).click()
    await expect(storage).toHaveCount(0)
    await expect(table.getByRole('row', { name: /^رنگ/ })).toBeVisible()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })
})

test.describe('compare table on a phone', () => {
  test('one product column and a part of the next fit beside the names, all as wide', async ({
    page,
  }) => {
    test.skip(!isPhone(page), 'the narrow table is for phones (below md)')
    await page.setViewportSize({ width: 375, height: 812 })
    const items = [S25, A56, IPHONE_15].map(({ slug, name }) => ({
      slug,
      name,
      image: 'http://localhost:8000/static/defaults/default.png',
      categoryId: 10002,
    }))
    await page.addInitScript((list) => {
      localStorage.setItem('ff-compare', JSON.stringify({ state: { items: list }, version: 0 }))
    }, items)
    await page.goto('/compare/')
    const table = page.getByRole('table', { name: 'مقایسه کالاها' })
    await expect(table.getByRole('link', { name: S25.name })).toBeVisible()
    const { box, columns } = await table.evaluate((element) => {
      const scroller = element.parentElement!.getBoundingClientRect()
      const heads = [...element.querySelectorAll('thead th')]
      return {
        box: { left: scroller.left, right: scroller.right },
        columns: heads.map((head) => head.getBoundingClientRect()),
      }
    })
    const [names, first, ...rest] = columns
    // The first product column is whole on screen beside the names; the next one shows a part.
    expect(first!.left).toBeGreaterThanOrEqual(box.left)
    expect(first!.right).toBeLessThanOrEqual(names!.left + 0.5)
    expect(rest[0]!.right).toBeGreaterThan(box.left)
    const widths = [first, ...rest].map((column) => Math.round(column!.width))
    expect(new Set(widths).size, `product column widths ${widths.join(', ')}`).toBe(1)
    // The narrow column still shows the whole name: «S25 اولترا» tells the products apart.
    const name = table.getByRole('link', { name: S25.name })
    const clipped = await name.evaluate((link) => link.scrollHeight > link.clientHeight + 1)
    expect(clipped, 'the S25 name is cut short').toBe(false)
  })
})

test.describe('compare bar on a product page', () => {
  test("stands clear of the phone's buy bar", async ({ page }) => {
    test.skip(!isPhone(page), 'the buy bar is for phones (below md)')
    // The narrowest common phone.
    await page.setViewportSize({ width: 375, height: 812 })
    const items = [IPHONE_15, A56].map(({ slug, name }) => ({
      slug,
      name,
      image: 'http://localhost:8000/static/defaults/default.png',
      categoryId: 10002,
    }))
    await page.addInitScript((list) => {
      localStorage.setItem('ff-compare', JSON.stringify({ state: { items: list }, version: 0 }))
    }, items)
    await page.goto(`/product/${S25.slug}/`)
    const bar = page.getByRole('region', { name: 'فهرست مقایسه' })
    const buyBar = page.getByRole('region', { name: 'نوار خرید' })
    await expect(bar).toBeVisible()
    await expect(buyBar).toBeVisible()
    const barBox = (await bar.boundingBox())!
    const buyBox = (await buyBar.boundingBox())!
    // Stacked above it, never overlapping.
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(buyBox.y)
  })
})

test.describe('recently viewed', () => {
  test('after visiting two products, the home page shows «بازدیدهای اخیر» with them', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    for (const product of [S25, IPHONE_15]) {
      await page.goto(`/product/${product.slug}/`)
      await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible()
      // The server HTML shows the heading before hydration: wait until the visit is saved.
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('ff-recent') ?? ''))
        .toContain(`"slug":"${product.slug}"`)
    }
    await page.goto('/')
    const strip = page.getByRole('region', { name: 'بازدیدهای اخیر' })
    await strip.scrollIntoViewIfNeeded()
    const names = strip.getByRole('article').getByRole('link')
    // Newest first.
    await expect(names).toHaveText([IPHONE_15.name, S25.name])
    // Compact cards: no price kept on the device.
    await expect(strip).not.toContainText('تومان')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })
})
