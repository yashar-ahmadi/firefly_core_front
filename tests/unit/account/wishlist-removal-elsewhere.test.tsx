import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WishlistPage } from '@/features/account/wishlist/wishlist-page'
import { useCompare } from '@/features/compare/store'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import {
  newWishlistApi,
  pageReads,
  renderWishlist,
  saved,
  stubWishlistApi,
  wishlistPage,
} from './wishlist-support'

// A heart's write on the wishlist page that lands while the card is not on screen: the visitor
// went to another view before the DELETE succeeded, or «بازگردانی» saved a card that comes back
// on another page. It is still said, and nothing waits to grab the focus later.

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

const UNSAVE = 'حذف از علاقه\u{200C}مندی\u{200C}ها'
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

const card = (name: string) => screen.getByRole('link', { name }).closest('article') as HTMLElement
const removedToast = () =>
  mocks.notify.success.mock.calls.find(([message]) => String(message).includes('حذف شد'))

async function heartOf(name: string) {
  const heart = await within(await waitFor(() => card(name))).findByRole('button', {
    name: UNSAVE,
  })
  await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'true'))
  return heart
}

describe('WishlistPage: writes that land while the card is elsewhere', () => {
  it('a removal that succeeds after the visitor changed the view is said, with «بازگردانی»', async () => {
    let finish: (value: unknown) => void = () => {}
    api.toggle.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const { user, rerender } = renderWishlist()
    await user.click(await heartOf('کالای ۲'))
    // Meanwhile «فقط کالاهای موجود»: card 2 (out of stock) is not on that view.
    api.list = (query) =>
      query.in_stock === 'true' ? wishlistPage([saved(1), saved(3)]) : wishlistPage(PRODUCTS)
    mocks.search = 'in_stock=true'
    rerender(<WishlistPage title="علاقه‌مندی‌ها" showOutOfStockLabel />)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'کالای ۲' })).toBeNull())
    api.saved = [1, 3]
    await act(async () => finish({ data: null, msg: '', status: 204 }))
    await waitFor(() => expect(removedToast()).toBeDefined())
    expect(removedToast()).toEqual([
      '«کالای ۲» از علاقه‌مندی‌ها حذف شد.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'بازگردانی' }) }),
    ])
    // This view kept its cards and its page.
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(history.replaced()).toEqual([])
  })

  it('a card that «بازگردانی» brings back on another page never takes the focus later', async () => {
    mocks.search = 'sort=added-asc'
    const { user, client } = renderWishlist()
    const heart = await heartOf('کالای ۱')
    api.saved = [2, 3]
    api.list = () => wishlistPage([saved(2), saved(3)])
    await user.click(heart)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'کالای ۱' })).toBeNull())
    // Saved anew it is the newest: last under «قدیمی‌ترین», on page 2 (21 saved).
    api.saved = [2, 3, 1]
    api.list = () => wishlistPage([saved(2), saved(3)], { count: 21, totalPages: 2 })
    const before = pageReads(mocks.bffFetch).length
    await act(async () => removedToast()![1].action.onClick(new MouseEvent('click')))
    expect(api.toggle).toHaveBeenLastCalledWith('product-1', 'POST')
    const heading = screen.getByRole('heading', { level: 1, name: 'علاقه‌مندی‌ها' })
    await waitFor(() => expect(pageReads(mocks.bffFetch).length).toBeGreaterThan(before))
    await waitFor(() => expect(client.isFetching({ queryKey: ['wishlist'] })).toBe(0))
    expect(heading).toHaveFocus()
    // Read again later with the card on this page after all: the focus stays where it is.
    api.list = () => wishlistPage([saved(2), saved(3), saved(1)])
    await act(() => client.invalidateQueries({ queryKey: ['wishlist'] }))
    expect(await screen.findByRole('link', { name: 'کالای ۱' })).toBeInTheDocument()
    expect(heading).toHaveFocus()
  })
})
