import { expect, type Locator, type Page } from '@playwright/test'
import type { ProductCard, WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// The wishlist page against the dev backend (Plan 3 Task 8), with the project's shared session
// (`signedInTest`). Sara's own wishlist is only read (it is empty in the dev data). The grid, the
// filters and the heart's writes run on a wishlist served here (three live catalog cards marked
// saved), so nothing is ever written: every heart's request is answered here.

const LIST = /\/api\/bff\/product\/wishlist\/list\//
const TOGGLE = /\/api\/bff\/product\/detail\/([^/]+)\/wishlist\//
const SUMMARY = /\/api\/bff\/dashboard\/summary\//
const UNSAVE = 'حذف از علاقه‌مندی‌ها'

const paginated = <T>(results: T[]): Paginated<T> => ({
  count: results.length,
  total_pages: 1,
  current_page: 1,
  page_size: 20,
  next: null,
  previous: null,
  results,
})

async function bffGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/bff/${path}`, {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: T }).data
}

/** Three live catalog cards, saved a day apart (the newest first); the second out of stock. */
async function savedCards(page: Page): Promise<WishlistProductCard[]> {
  const list = await bffGet<Paginated<ProductCard>>(page, 'product/list/?limit=3')
  expect(list.results.length).toBe(3)
  return list.results.map((card, index) => ({
    ...card,
    in_stock: index === 1 ? false : card.in_stock,
    is_in_wishlist: true,
    added_at: `2026-10-0${3 - index}T10:00:00+03:30`,
  }))
}

/**
 * Serves the wishlist (the page's list and the hearts' ids) from `state`, answers the hearts'
 * writes (recorded in `writes`) and makes the summary count it. A request held by `hold` waits.
 */
async function serveWishlist(page: Page, saved: WishlistProductCard[]) {
  // (Each test drops these routes at its end: a summary read still on its way is not an error.)
  const state = { saved: [...saved], writes: [] as string[], hold: null as Promise<void> | null }
  await page.route(LIST, async (route) => {
    const url = new URL(route.request().url())
    if (state.hold && url.searchParams.get('limit') !== '100') await state.hold
    let results = [...state.saved]
    if (url.searchParams.get('sort') === 'added-asc') results.reverse()
    if (url.searchParams.get('in_stock') === 'true') results = results.filter((p) => p.in_stock)
    await route.fulfill({ json: { msg: '', code: 200, data: paginated(results) } })
  })
  await page.route(TOGGLE, async (route) => {
    const method = route.request().method()
    const slug = decodeURIComponent(TOGGLE.exec(route.request().url())![1]!)
    state.writes.push(`${method} ${slug}`)
    const product = saved.find((card) => card.slug === slug)!
    if (method === 'DELETE') {
      state.saved = state.saved.filter((card) => card.slug !== slug)
      return route.fulfill({ status: 204, body: '' })
    }
    state.saved = [product, ...state.saved.filter((card) => card.slug !== slug)]
    return route.fulfill({
      status: 201,
      json: { msg: 'محصول به علاقه‌مندی‌ها اضافه شد.', code: 201, data: { is_in_wishlist: true } },
    })
  })
  await page.route(SUMMARY, async (route) => {
    const response = await route.fetch()
    const json = (await response.json()) as { data: { wishlist_count: number } }
    json.data.wishlist_count = state.saved.length
    await route.fulfill({ response, json })
  })
  return state
}

const grid = (page: Page) => page.getByRole('list', { name: 'علاقه‌مندی‌ها' })
const names = (cards: Locator) => cards.locator('h3 a').allInnerTexts()

signedInTest(
  'shows sara’s wishlist: noindex, never cached, her saved products or the empty state',
  async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/account/wishlist/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/^علاقه‌مندی‌ها \| /)
    await expect(page.getByRole('heading', { level: 1, name: 'علاقه‌مندی‌ها' })).toBeVisible()

    const live = await bffGet<Paginated<WishlistProductCard>>(page, 'product/wishlist/list/')
    if (live.count === 0) {
      await expect(
        page.getByRole('heading', { name: 'هنوز کالایی به علاقه‌مندی‌ها اضافه نکرده‌اید' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'رفتن به صفحه اصلی' })).toHaveAttribute(
        'href',
        '/',
      )
    } else {
      await expect(grid(page).getByRole('article')).toHaveCount(live.results.length)
    }
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(
        page
          .getByRole('navigation', { name: 'حساب کاربری' })
          .getByRole('link', { name: /^علاقه‌مندی‌ها/ }),
      ).toHaveAttribute('aria-current', 'page')
    }
    expect(errors).toEqual([])
  },
)

signedInTest(
  'the grid: card and skeleton the same height; sort and the switch in the URL',
  async ({ page }) => {
    const errors = watchErrors(page)
    const cards = await savedCards(page)
    const state = await serveWishlist(page, cards)
    let release = () => {}
    state.hold = new Promise((resolve) => (release = resolve))
    await page.goto('/account/wishlist/')
    const skeleton = page
      .locator('[aria-busy="true"]', { has: page.getByText('در حال بارگذاری کالاها') })
      .locator('[aria-hidden="true"]')
      .first()
    await expect(skeleton).toBeVisible()
    const skeletonHeight = (await skeleton.boundingBox())!.height
    release()
    state.hold = null
    await expect(grid(page).getByRole('article')).toHaveCount(3)
    const cardHeight = (await grid(page).getByRole('listitem').first().boundingBox())!.height
    expect(
      Math.abs(cardHeight - skeletonHeight),
      `${cardHeight} vs ${skeletonHeight}`,
    ).toBeLessThan(2)
    expect(await names(grid(page))).toEqual(cards.map((card) => card.name))
    await expect(page.getByText('۳ کالا', { exact: true })).toBeVisible()

    await page.getByRole('combobox', { name: 'مرتب‌سازی' }).selectOption({ label: 'قدیمی‌ترین' })
    await expect(page).toHaveURL(/\/account\/wishlist\/\?sort=added-asc$/)
    await expect.poll(() => names(grid(page))).toEqual(cards.map((card) => card.name).reverse())

    await page.getByRole('switch', { name: 'فقط کالاهای موجود' }).click()
    await expect(page).toHaveURL(/\/account\/wishlist\/\?sort=added-asc&in_stock=true$/)
    await expect(grid(page).getByRole('article')).toHaveCount(2)
    await expect(page.getByText('۲ کالا', { exact: true })).toBeVisible()
    // The URL is the state: a reload shows the same list.
    await page.reload()
    await expect(page.getByRole('switch', { name: 'فقط کالاهای موجود' })).toBeChecked()
    await expect(grid(page).getByRole('article')).toHaveCount(2)

    const width = page.viewportSize()?.width ?? 0
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    expect(state.writes).toEqual([])
    expect(errors).toEqual([])
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  },
)

signedInTest(
  'a heart takes its card out, «بازگردانی» brings it back (writes answered here)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const cards = await savedCards(page)
    const state = await serveWishlist(page, cards)
    await page.goto('/account/wishlist/')
    const first = grid(page).getByRole('article').filter({ hasText: cards[0]!.name })
    const heart = first.getByRole('button', { name: UNSAVE })
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    await heart.click()
    await expect(grid(page).getByRole('article')).toHaveCount(2)
    // The toaster's region (the shell's live region says the same words, unseen).
    const toasts = page.getByRole('region', { name: /^اعلان‌ها/ })
    await expect(toasts.getByText(`«${cards[0]!.name}» از علاقه‌مندی‌ها حذف شد.`)).toBeVisible()
    await toasts.getByRole('button', { name: 'بازگردانی' }).click()
    await expect(grid(page).getByRole('article')).toHaveCount(3)
    await expect(grid(page).getByRole('article').first()).toContainText(cards[0]!.name)
    expect(state.writes).toEqual([`DELETE ${cards[0]!.slug}`, `POST ${cards[0]!.slug}`])
    expect(errors).toEqual([])
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  },
)

signedInTest(
  'empty: nothing saved, or nothing in stock (and the way back to all)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const cards = await savedCards(page)
    const state = await serveWishlist(page, [cards[1]!])
    await page.goto('/account/wishlist/?in_stock=true')
    await expect(
      page.getByRole('heading', { name: 'کالای موجودی در علاقه‌مندی‌ها نیست' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'نمایش همه کالاها' }).click()
    await expect(page).toHaveURL(/\/account\/wishlist\/$/)
    await expect(grid(page).getByRole('article')).toHaveCount(1)

    state.saved = []
    await page.goto('/account/wishlist/')
    await expect(
      page.getByRole('heading', { name: 'هنوز کالایی به علاقه‌مندی‌ها اضافه نکرده‌اید' }),
    ).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(0)
    expect(state.writes).toEqual([])
    expect(errors).toEqual([])
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  },
)
