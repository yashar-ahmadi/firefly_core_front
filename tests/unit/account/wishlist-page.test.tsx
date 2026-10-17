import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompare } from '@/features/compare/store'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import {
  newWishlistApi,
  pageReads,
  pastTheEnd,
  renderWishlist,
  saved,
  stubWishlistApi,
  WISHLIST_LIST,
  wishlistPage,
} from './wishlist-support'

// `/account/wishlist/` (product digest §3.15, dashboard digest §3.3): the saved products as the
// catalog's cards, sorted by when they were saved, «فقط کالاهای موجود», pages; all of it in the
// URL (`?sort=added-asc&in_stock=true&page=2`, defaults left out).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  search: '',
  replace: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/account/wishlist/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

const PRODUCTS = [saved(1), saved(2, { in_stock: false }), saved(3)]
let api = newWishlistApi(PRODUCTS)

let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  localStorage.clear()
  useCompare.setState({ items: [] })
  mocks.search = ''
  api = newWishlistApi(PRODUCTS)
  stubWishlistApi(mocks.bffFetch, api)
})

const sort = () => screen.getByRole('combobox', { name: 'مرتب‌سازی' })
const inStock = () => screen.getByRole('switch', { name: 'فقط کالاهای موجود' })

describe('WishlistPage', () => {
  it('shows the saved products as the catalog’s cards, newest saved first', async () => {
    renderWishlist()
    expect(screen.getByRole('heading', { level: 1, name: 'علاقه‌مندی‌ها' })).toBeVisible()
    const list = await screen.findByRole('list', { name: 'علاقه‌مندی‌ها' })
    const cards = within(list).getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]!).getByRole('link', { name: 'کالای ۱' })).toHaveAttribute(
      'href',
      '/product/product-1/',
    )
    // The card's own add-to-cart, as on the catalog; the shop's «ناموجود».
    expect(within(cards[0]!).getByRole('button', { name: 'افزودن به سبد' })).toBeVisible()
    expect(within(cards[1]!).getAllByText('ناموجود')[0]).toBeVisible()
    expect(screen.getByText('۳ کالا')).toBeVisible()
    expect(sort()).toHaveValue('added-desc')
    expect(inStock()).not.toBeChecked()
    expect(pageReads(mocks.bffFetch)).toEqual([WISHLIST_LIST])
    // The hearts know these are saved (the shared wishlist ids).
    await waitFor(() =>
      expect(
        within(cards[0]!).getByRole('button', { name: 'حذف از علاقه\u{200C}مندی\u{200C}ها' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('reads sort, in_stock and page from the URL and sends them', async () => {
    mocks.search = 'sort=added-asc&in_stock=true&page=2'
    api.list = () => wishlistPage([saved(3)], { count: 21, page: 2, totalPages: 2 })
    renderWishlist()
    await screen.findByRole('article')
    expect(pageReads(mocks.bffFetch)).toEqual([
      `${WISHLIST_LIST}?sort=added-asc&in_stock=true&page=2`,
    ])
    expect(sort()).toHaveValue('added-asc')
    expect(inStock()).toBeChecked()
    // The pager keeps the filters.
    expect(screen.getByRole('link', { name: 'صفحه قبلی' })).toHaveAttribute(
      'href',
      '/account/wishlist/?sort=added-asc&in_stock=true',
    )
  })

  it('values the API would refuse are never sent: the defaults instead', async () => {
    mocks.search = 'sort=price-asc&in_stock=maybe&page=-2'
    renderWishlist()
    await screen.findAllByRole('article')
    expect(pageReads(mocks.bffFetch)).toEqual([WISHLIST_LIST])
    expect(sort()).toHaveValue('added-desc')
  })

  it('a new sort or the switch goes back to page 1, in the URL', async () => {
    mocks.search = 'page=2'
    api.list = () => wishlistPage(PRODUCTS, { count: 23, page: 2, totalPages: 2 })
    const { user } = renderWishlist()
    await screen.findAllByRole('article')
    await user.selectOptions(sort(), 'قدیمی‌ترین')
    expect(history.replaced().at(-1)).toBe('/account/wishlist/?sort=added-asc')
    await user.click(inStock())
    expect(history.replaced().at(-1)).toBe('/account/wishlist/?in_stock=true')
  })

  it('a page link changes only the URL (a new history entry, no server round trip)', async () => {
    api.list = () => wishlistPage(PRODUCTS, { count: 23, totalPages: 2 })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { user } = renderWishlist()
    await user.click(await screen.findByRole('link', { name: 'صفحه بعدی' }))
    expect(history.pushed()).toEqual(['/account/wishlist/?page=2'])
    expect(mocks.replace).not.toHaveBeenCalled()
    scrollTo.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('turning the switch off clears it from the URL', async () => {
    mocks.search = 'sort=added-asc&in_stock=true'
    const { user } = renderWishlist()
    await screen.findAllByRole('article')
    await user.click(inStock())
    expect(history.replaced().at(-1)).toBe('/account/wishlist/?sort=added-asc')
  })

  it('a page past the end (404): goes to the last page there is', async () => {
    mocks.search = 'in_stock=true&page=7'
    api.list = (query) =>
      query.page === 7 ? pastTheEnd() : wishlistPage(PRODUCTS, { count: 45, totalPages: 3 })
    renderWishlist()
    await waitFor(() =>
      expect(history.replaced()).toContain('/account/wishlist/?in_stock=true&page=3'),
    )
  })

  it('nothing saved: a friendly message and the way to the home page', async () => {
    api = newWishlistApi([])
    stubWishlistApi(mocks.bffFetch, api)
    renderWishlist()
    expect(
      await screen.findByRole('heading', { name: 'هنوز کالایی به علاقه‌مندی‌ها اضافه نکرده‌اید' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /صفحه اصلی/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('only the in-stock switch empties it: says so, with a button that clears the filter', async () => {
    mocks.search = 'in_stock=true'
    api.list = () => wishlistPage([])
    const { user } = renderWishlist()
    expect(
      await screen.findByRole('heading', { name: 'کالای موجودی در علاقه‌مندی‌ها نیست' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'نمایش همه کالاها' }))
    expect(history.replaced().at(-1)).toBe('/account/wishlist/')
  })

  it('a failed read (a 404 on page 1 too: no page past the end): «تلاش دوباره» reads it again', async () => {
    let fail = true
    api.list = () => (fail ? pastTheEnd() : wishlistPage(PRODUCTS.slice(0, 1)))
    const { user } = renderWishlist()
    expect(await screen.findByText('علاقه‌مندی‌ها بارگذاری نشد.')).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })
})
