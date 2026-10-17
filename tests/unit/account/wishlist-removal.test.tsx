import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompare } from '@/features/compare/store'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  newWishlistApi,
  pageReads,
  pastTheEnd,
  renderWishlist,
  saved,
  stubWishlistApi,
  wishlistPage,
} from './wishlist-support'

// A heart pressed on the wishlist page (the card's own, P3-R4): once the DELETE succeeded the
// card leaves the grid, it is said, and the toast offers «بازگردانی» (saves it again); the list
// and the summary are read again. The last card of a page after the first: the page before.

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
const PRODUCTS = [saved(1), saved(2), saved(3)]
let api = newWishlistApi(PRODUCTS)

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  localStorage.clear()
  useCompare.setState({ items: [] })
  mocks.search = ''
  api = newWishlistApi(PRODUCTS)
  stubWishlistApi(mocks.bffFetch, api)
})

const card = (name: string) => screen.getByRole('link', { name }).closest('article') as HTMLElement
const summaryReads = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => path === 'dashboard/summary/').length

/** The heart of `name`'s card, once the saved ids are in (pressed). */
async function heartOf(name: string) {
  const heart = await within(await waitFor(() => card(name))).findByRole('button', {
    name: UNSAVE,
  })
  await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'true'))
  return heart
}

/** The server's wishlist once `id` is gone. */
function serverWithout(id: number) {
  api.saved = api.saved.filter((saved) => saved !== id)
  api.list = () => wishlistPage(PRODUCTS.filter((product) => api.saved.includes(product.id)))
}

describe('WishlistPage: removing from the wishlist', () => {
  it('takes the card out once the DELETE succeeded, says so and offers «بازگردانی»', async () => {
    let finish: (value: unknown) => void = () => {}
    api.toggle.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const { user } = renderWishlist()
    const heart = await heartOf('کالای ۲')
    const listsBefore = pageReads(mocks.bffFetch).length
    const summariesBefore = summaryReads()
    await user.click(heart)
    expect(api.toggle).toHaveBeenCalledWith('product-2', 'DELETE')
    // Not before the write succeeded.
    expect(card('کالای ۲')).toBeInTheDocument()
    serverWithout(2)
    await act(async () => finish({ data: null, msg: '', status: 204 }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'کالای ۲' })).toBeNull())
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(mocks.notify.success).toHaveBeenCalledWith(
      '«کالای ۲» از علاقه‌مندی‌ها حذف شد.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'بازگردانی' }) }),
    )
    // The focus was in the card that went: the next card's link takes it.
    await waitFor(() => expect(screen.getByRole('link', { name: 'کالای ۳' })).toHaveFocus())
    await waitFor(() => expect(pageReads(mocks.bffFetch).length).toBeGreaterThan(listsBefore))
    await waitFor(() => expect(summaryReads()).toBeGreaterThan(summariesBefore))
  })

  it('«بازگردانی» saves it again (POST) and the card comes back', async () => {
    const { user } = renderWishlist()
    const heart = await heartOf('کالای ۱')
    serverWithout(1)
    await user.click(heart)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'کالای ۱' })).toBeNull())
    const [, options] = mocks.notify.success.mock.calls.find(([message]) =>
      String(message).includes('حذف شد'),
    )!
    // The server has it again from now on (saved anew: at the top, newest first).
    api.saved = [1, ...api.saved]
    api.list = () => wishlistPage(PRODUCTS)
    await act(async () => options.action.onClick(new MouseEvent('click')))
    expect(api.toggle).toHaveBeenLastCalledWith('product-1', 'POST')
    expect(await screen.findByRole('link', { name: 'کالای ۱' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    // The toast that had the focus is gone: the card that came back takes it.
    await waitFor(() => expect(screen.getByRole('link', { name: 'کالای ۱' })).toHaveFocus())
  })

  it('a failed DELETE leaves the card, its heart pressed again, and says why', async () => {
    api.toggle.mockRejectedValueOnce(
      ApiError.fromBody(500, {
        msg: 'خطا',
        data: {
          type: 'server_error',
          errors: [{ code: 'error', detail: 'خطای سرور', attr: null }],
        },
      }),
    )
    const { user } = renderWishlist()
    const heart = await heartOf('کالای ۲')
    await user.click(heart)
    await waitFor(() => expect(mocks.notify.error).toHaveBeenCalledWith('خطای سرور'))
    expect(card('کالای ۲')).toBeInTheDocument()
    await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'true'))
    expect(mocks.notify.success).not.toHaveBeenCalled()
  })

  it('the last card of page 2: goes to page 1', async () => {
    mocks.search = 'sort=added-asc&page=2'
    api.list = () => wishlistPage([saved(3)], { count: 21, page: 2, totalPages: 2 })
    const { user } = renderWishlist()
    api.saved = [1, 2, 3]
    const heart = await heartOf('کالای ۳')
    // From now on page 2 is past the end.
    api.list = (query) => (query.page === 2 ? pastTheEnd() : wishlistPage(PRODUCTS.slice(0, 2)))
    await user.click(heart)
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/account/wishlist/?sort=added-asc', {
        scroll: false,
      }),
    )
  })
})
