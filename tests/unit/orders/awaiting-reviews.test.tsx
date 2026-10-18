import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AwaitingReviewsPage } from '@/features/orders/reviews/awaiting-reviews-page'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  calls,
  ok,
  page,
  refuse,
  renderAccount,
  reviewsPage,
  serve,
  summary,
} from './account-support'

// «در انتظار دیدگاه» (order digest §3.1.6–3.1.7, §6.5; dashboard digest §3.2 page 9): one card
// per (order, product) of the purchases awaiting a review, newest delivery first: the product's
// picture and name (its page), the order and when it was delivered, «ثبت دیدگاه» («ثبت دیدگاه
// جدید» for a product reviewed before) opening the review form. A review sent: the API's
// sentence, the purchase off the list (its order too when nothing is left), the list and the
// summary read again. The order page's «ثبت دیدگاه» lands on its purchase (`?order=&product=`).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '', announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/reviews/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

const LIST = 'order/review/awaiting/list/'
const SAVED = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'
let list = reviewsPage()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.search = ''
  list = reviewsPage()
  serve(mocks.bffFetch, {
    [LIST]: () => ok(list),
    'dashboard/summary/': () => ok(summary()),
    'order/6270624849/review/': () => {
      // Reviewed: the server lists it no more.
      list = { ...list, count: list.count - 1, results: list.results.slice(1) }
      return ok({}, SAVED, 201)
    },
  })
})

const renderPage = () => renderAccount(<AwaitingReviewsPage title="در انتظار دیدگاه" />)
const card = (name: string) => screen.getByRole('article', { name: new RegExp(name) })

describe('the purchases awaiting a review', () => {
  it('a card per order and product, with its order, delivery date and product page', async () => {
    renderPage()
    const cards = await screen.findAllByRole('article')
    // Four orders, seven purchases (the summary's `awaiting_review_count`).
    expect(cards).toHaveLength(7)
    const notebook = card('دفتر یادداشت A5')
    expect(notebook).toHaveTextContent('سفارش ۶۲۷۰۶۲۴۸۴۹')
    expect(notebook).toHaveTextContent('۱۶ شهریور ۱۴۰۵')
    expect(within(notebook).getByRole('link', { name: /دفتر یادداشت A5/ })).toHaveAttribute(
      'href',
      '/product/notebook-a5-hardcover/',
    )
    expect(within(notebook).getByRole('button', { name: /^ثبت دیدگاه/ })).toBeVisible()
  })

  it('a product reviewed before (another order): «ثبت دیدگاه جدید»', async () => {
    list.results[0]!.products[0]!.has_other_review = true
    renderPage()
    await screen.findAllByRole('article')
    expect(
      within(card('دفتر یادداشت A5')).getByRole('button', { name: /ثبت دیدگاه جدید/ }),
    ).toBeVisible()
  })

  it('from the order’s page: its purchase’s button takes the focus', async () => {
    mocks.search = 'order=6216528804&product=online-course-seo'
    renderPage()
    await screen.findAllByRole('article')
    await waitFor(() =>
      expect(within(card('دوره آموزش آنلاین سئو')).getByRole('button')).toHaveFocus(),
    )
  })

  it('nothing awaits a review: said so, with the way to the orders', async () => {
    list = page([])
    renderPage()
    expect(await screen.findByRole('heading', { name: 'دیدگاهی در انتظار شما نیست' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })
})

describe('a review sent', () => {
  async function review(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(card('دفتر یادداشت A5')).getByRole('button', { name: /^ثبت دیدگاه/ }))
    const dialog = await screen.findByRole('dialog', { name: /دفتر یادداشت A5/ })
    await user.click(await within(dialog).findByRole('radio', { name: /^۵ ستاره/ }))
    await user.type(within(dialog).getByRole('textbox', { name: /متن دیدگاه/ }), 'کاغذ خوبی دارد')
    await user.click(within(dialog).getByRole('button', { name: 'ثبت دیدگاه' }))
    return dialog
  }

  it('201: the API’s sentence, the purchase (and its order, now empty) gone, list and summary read again', async () => {
    const user = userEvent.setup()
    const { client } = renderPage()
    // The badges' summary, as the account shell holds it.
    client.setQueryData(SUMMARY_KEY, summary())
    await screen.findAllByRole('article')
    const listReads = calls(mocks.bffFetch, LIST).length
    await review(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.announce).toHaveBeenCalledWith(SAVED)
    expect(screen.queryByRole('article', { name: /دفتر یادداشت A5/ })).toBeNull()
    // Its order had nothing else to review: no card of it is left.
    const left = screen.getAllByRole('article').map((article) => article.textContent ?? '')
    expect(left.some((text) => text.includes('۶۲۷۰۶۲۴۸۴۹'))).toBe(false)
    await waitFor(() => expect(calls(mocks.bffFetch, LIST).length).toBeGreaterThan(listReads))
    // Read again by whatever shows it (the shell's badges: `awaiting_review_count`).
    expect(client.getQueryState(SUMMARY_KEY)?.isInvalidated).toBe(true)
  })

  it('201: the purchase leaves the list at once, before the list is read again', async () => {
    let reads = 0
    serve(mocks.bffFetch, {
      // The first read answers; the one after the review never does.
      [LIST]: () => (reads++ === 0 ? ok(list) : new Promise(() => {})),
      'dashboard/summary/': () => ok(summary()),
      'order/6270624849/review/': () => ok({}, SAVED, 201),
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findAllByRole('article')).toHaveLength(7)
    await review(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('article', { name: /دفتر یادداشت A5/ })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(6)
    expect(reads).toBe(2)
  })

  it('409 already reviewed: the list read again, with why, and the form closed', async () => {
    serve(mocks.bffFetch, {
      [LIST]: () => ok(list),
      'dashboard/summary/': () => ok(summary()),
      'order/6270624849/review/': () => refuse(409, 'order_review_already_submitted'),
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    const listReads = calls(mocks.bffFetch, LIST).length
    await review(user)
    expect(await screen.findByText(/دیدگاه این خرید پیش‌تر ثبت شده است/)).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(calls(mocks.bffFetch, LIST).length).toBeGreaterThan(listReads))
  })
})
