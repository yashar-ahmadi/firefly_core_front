import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AwaitingReviewsPage } from '@/features/orders/reviews/awaiting-reviews-page'
import { AWAITING_REVIEWS_KEY } from '@/features/orders/reviews/reviews-api'
import { stubBrowserApis } from '../support/dom-stubs'
import { ok, renderAccount, reviewsPage, serve, summary } from './account-support'

// «در انتظار دیدگاه»'s edges (Task 8 review): a review sent after the list was read again (other
// objects, the same purchases) still moves the focus to the next purchase, never to the one that
// went; the order page's purchase that is not on the page shown (an older page, or reviewed
// meanwhile) is said, not silently missing.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '' }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/reviews/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

const LIST = 'order/review/awaiting/list/'
const SAVED = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.search = ''
  // A fresh copy on every read: the list read again holds other objects.
  serve(mocks.bffFetch, {
    [LIST]: () => ok(reviewsPage()),
    'dashboard/summary/': () => ok(summary()),
    'order/6216528804/review/': () => ok({}, SAVED, 201),
  })
})

const renderPage = () => renderAccount(<AwaitingReviewsPage title="در انتظار دیدگاه" />)
const card = (name: string) => screen.getByRole('article', { name: new RegExp(name) })

describe('a review sent after the list was read again', () => {
  it('the focus goes to the next purchase (compared by order code, not by object)', async () => {
    const user = userEvent.setup()
    const { client } = renderPage()
    await screen.findAllByRole('article')
    await user.click(within(card('کتاب الکترونیکی')).getByRole('button', { name: /^ثبت دیدگاه/ }))
    const dialog = await screen.findByRole('dialog', { name: /کتاب الکترونیکی/ })
    // The list is read again while the form is open: the same purchases, but that order's other
    // product changed (reviewed elsewhere meanwhile), so its order is a new object.
    let reads = 0
    serve(mocks.bffFetch, {
      [LIST]: () => {
        const again = reviewsPage()
        again.results[1]!.products[1]!.has_other_review = true
        reads++
        return ok(again)
      },
      'dashboard/summary/': () => ok(summary()),
      'order/6216528804/review/': () => ok({}, SAVED, 201),
    })
    await act(() => client.invalidateQueries({ queryKey: AWAITING_REVIEWS_KEY }))
    await waitFor(() => expect(reads).toBe(1))
    await user.click(await within(dialog).findByRole('radio', { name: /^۴ ستاره/ }))
    await user.type(within(dialog).getByRole('textbox', { name: /متن دیدگاه/ }), 'مفید بود')
    await user.click(within(dialog).getByRole('button', { name: 'ثبت دیدگاه' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(within(card('دوره آموزش آنلاین سئو')).getByRole('button')).toHaveFocus(),
    )
  })
})

describe('the order page’s purchase', () => {
  it('not on the page shown: said so (nothing silently missing)', async () => {
    mocks.search = 'order=1111111111&product=old-purchase'
    renderPage()
    await screen.findAllByRole('article')
    expect(await screen.findByRole('status')).toHaveTextContent(
      /کالایی که از صفحهٔ سفارش انتخاب کردید در این صفحه نیست/,
    )
  })

  it('on the page: no such notice', async () => {
    mocks.search = 'order=6216528804&product=online-course-seo'
    renderPage()
    await screen.findAllByRole('article')
    await waitFor(() =>
      expect(within(card('دوره آموزش آنلاین سئو')).getByRole('button')).toHaveFocus(),
    )
    expect(screen.queryByText(/در این صفحه نیست/)).toBeNull()
  })
})
