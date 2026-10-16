import { expect, test, type Page } from '@playwright/test'

// The listing routes against the dev backend's sample data: category, brand, curated list and
// the generic listing (product digest §6, §12).

const PHONES = '/product-category/digital/mobile-phone/'
/** The sidebar replaces the filter sheet from lg (1024px). */
const LG = 1024

/**
 * Page errors and console errors seen while the page runs: hydration mismatches included, also
 * the production build's minified ones («Minified React error #418»). Only failed resource
 * loads are let through: the dev backend has no media files.
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (/^Failed to load resource/.test(message.text())) return
    errors.push(message.text())
  })
  return errors
}

/** The server-rendered grid of the first page. */
const firstPage = (page: Page) => page.getByRole('list', { name: 'صفحهٔ ۱' })

test.describe('category page', () => {
  test('shows the category heading and its products, and hydrates cleanly', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(PHONES)
    await expect(page.getByRole('heading', { level: 1, name: 'گوشی موبایل' })).toBeVisible()
    expect(await firstPage(page).getByRole('article').count()).toBeGreaterThanOrEqual(6)
    await expect(page).toHaveTitle('گوشی موبایل | فروشگاه فایرفلای')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('carries its SEO head: self canonical and the breadcrumb JSON-LD', async ({ page }) => {
    await page.goto(PHONES)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `http://localhost:3000${PHONES}`,
    )
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent()
    const crumbs = JSON.parse(jsonLd ?? '{}') as { itemListElement: { item: string }[] }
    expect(crumbs.itemListElement.at(-1)?.item).toBe(`http://localhost:3000${PHONES}`)
  })

  test('a filtered URL is noindex, follow', async ({ page }) => {
    await page.goto(`${PHONES}?brand=apple`)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  })

  test('a root category links its subcategories', async ({ page }) => {
    await page.goto('/product-category/digital/')
    const chips = page.getByRole('navigation', { name: 'زیردسته‌ها' })
    await expect(chips.getByRole('link', { name: /گوشی موبایل/ })).toHaveAttribute('href', PHONES)
  })

  test('choosing the brand «اپل» filters the grid through the URL', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(PHONES)
    await expect(firstPage(page).getByRole('article')).toHaveCount(7)
    const narrow = (page.viewportSize()?.width ?? 0) < LG
    if (narrow) await page.getByRole('button', { name: 'فیلترها' }).click()
    const filters = narrow
      ? page.getByRole('dialog', { name: 'فیلترها' })
      : page.getByRole('complementary', { name: 'فیلترها' })
    await filters.getByRole('checkbox', { name: 'اپل' }).click()
    await expect(page).toHaveURL(/[?&]brand=apple(?:&|$)/)
    if (narrow) await page.getByRole('button', { name: 'نمایش ۲ کالا' }).click()
    await expect(firstPage(page).getByRole('article')).toHaveCount(2)
    for (const name of await firstPage(page).getByRole('article').getByRole('heading').all()) {
      await expect(name).toContainText('اپل')
    }
    expect(errors).toEqual([])
  })

  test('a path that is not the category path answers 308 to it, query kept', async ({
    request,
  }) => {
    const response = await request.get('/product-category/mobile-phone/?brand=apple', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(new URL(response.headers().location ?? '', 'http://localhost:3000').href).toBe(
      `http://localhost:3000${PHONES}?brand=apple`,
    )
  })

  test('the 308 lands on the category page', async ({ page }) => {
    await page.goto('/product-category/mobile-phone/')
    await expect(page).toHaveURL(PHONES)
    await expect(page.getByRole('heading', { level: 1, name: 'گوشی موبایل' })).toBeVisible()
  })

  test('a page past the last answers 404', async ({ page }) => {
    const response = await page.goto(`${PHONES}?page=999`)
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/پیدا نشد/)
  })

  test('an unknown category answers 404 with a not-found title', async ({ page }) => {
    const response = await page.goto('/product-category/digital/no-such-category/')
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/^صفحه پیدا نشد \|/)
  })

  for (const path of ['/product-category/abc%ZZ/', '/product-category/digital/%E0%A4%A/']) {
    test(`an undecodable path answers 404, not 500: ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(404)
      expect(response.headers()['cache-control']).toBe('no-store')
      expect(await response.text()).toContain('صفحه پیدا نشد')
    })
  }

  test('the filter sheet opens and closes on phones', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= LG, 'the sidebar shows the filters from lg')
    await page.goto(PHONES)
    await page.getByRole('button', { name: 'فیلترها' }).click()
    const sheet = page.getByRole('dialog', { name: 'فیلترها' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('checkbox', { name: 'اپل' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: 'فیلترها' }).click()
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /^نمایش ۷ کالا$/ }).click()
    await expect(sheet).toBeHidden()
  })
})

test.describe('brands', () => {
  test('the brand page lists the brand products', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/brand/samsung/')
    await expect(page.getByRole('heading', { level: 1, name: 'سامسونگ' })).toBeVisible()
    await expect(firstPage(page).getByRole('article')).toHaveCount(4)
    await expect(page.getByText('۴ کالا', { exact: true })).toBeVisible()
    await expect(page).toHaveTitle('خرید محصولات سامسونگ')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('an unknown brand answers 404', async ({ page }) => {
    expect((await page.goto('/brand/no-such-brand/'))?.status()).toBe(404)
  })

  test('the brands index links every brand to its page', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/brand/')
    await expect(page.getByRole('heading', { level: 1, name: 'برندها' })).toBeVisible()
    const brands = page.getByRole('list', { name: 'برندها' })
    expect(await brands.getByRole('link').count()).toBeGreaterThanOrEqual(20)
    await brands.getByRole('link', { name: /سامسونگ/ }).click()
    await expect(page).toHaveURL('/brand/samsung/')
    await expect(page.getByRole('heading', { level: 1, name: 'سامسونگ' })).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('curated list and generic listing', () => {
  test('the list page shows its six products', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/product/list/flagship-phones/')
    await expect(page.getByRole('heading', { level: 1, name: 'گوشی های پرچمدار' })).toBeVisible()
    await expect(firstPage(page).getByRole('article')).toHaveCount(6)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('an unknown list page answers 404', async ({ page }) => {
    expect((await page.goto('/product/list/no-such-list/'))?.status()).toBe(404)
  })

  test('discounts: titled «تخفیف‌ها», noindex, and empty (dev has no discounts)', async ({
    page,
  }) => {
    await page.goto('/product/list/?has_discount=true')
    await expect(page.getByRole('heading', { level: 1, name: 'تخفیف‌ها' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'محصولی با این فیلترها یافت نشد' }),
    ).toBeVisible()
    await expect(page).toHaveTitle(/^تخفیف‌ها \|/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://localhost:3000/product/list/',
    )
  })

  test('load more appends the next page and records it in the URL', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/product/list/')
    await expect(page.getByRole('heading', { level: 1, name: 'همهٔ محصولات' })).toBeVisible()
    await page.getByRole('button', { name: 'نمایش بیشتر' }).click()
    await expect(page.getByRole('list', { name: 'صفحهٔ ۲' }).getByRole('article')).toHaveCount(24)
    await expect(page).toHaveURL('/product/list/?page=2')
    expect(errors).toEqual([])
  })
})
