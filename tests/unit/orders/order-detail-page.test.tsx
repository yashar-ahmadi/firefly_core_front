import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderDetailPage } from '@/features/orders/account/order-detail-page'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { calls, detail, ok, payments, refuse, renderAccount, serve } from './account-support'

// An account order's page (order digest §6.4): the heading (its code, its status), when it was
// placed and paid, the server's progress drawn exactly and the factual timeline, the lines (a
// review per `review_state`), the API's money, the payments read on their own, the delivery (the
// carrier, the tracking code) and the receiver. The server's first read is used as it is; without
// one the page reads the order itself, and a 404 says it was not found here.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/7010868573/',
}))

const CODE = '7010868573'
beforeEach(() => {
  stubBrowserApis()
  mocks.bffFetch.mockReset()
  serve(mocks.bffFetch, { 'payment/history/': () => ok(payments('delivered')) })
})

const renderPage = (initial: OrderDetail | null, code = CODE) =>
  renderAccount(
    <OrderDetailPage code={code} initial={initial} catalog={catalog()} supportPhone={null} />,
  )
const section = (name: string | RegExp) => screen.getByRole('region', { name })

describe('the order, as the server read it', () => {
  it('its heading, status, dates, progress and timeline; the order is not read again', async () => {
    renderPage(detail('delivered'))
    expect(screen.getByRole('heading', { level: 1, name: 'سفارش ۷۰۱۰۸۶۸۵۷۳' })).toBeVisible()
    expect(screen.getAllByText('تکمیل شده')[0]).toBeVisible()
    expect(document.body).toHaveTextContent('۲۰ مرداد ۱۴۰۵')
    const steps = within(screen.getByRole('list', { name: 'مراحل سفارش' })).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'current',
    ])
    expect(screen.getByRole('heading', { name: 'تاریخچه\u{0654} سفارش' })).toBeVisible()
    expect(calls(mocks.bffFetch, `order/${CODE}/`)).toHaveLength(0)
  })

  it('a review per line: «ثبت دیدگاه» for one awaiting it (to that purchase), the state otherwise', async () => {
    const order = detail('delivered')
    order.lines[1] = { ...order.lines[1]!, review_state: 'reviewed' }
    order.lines.push({
      ...order.lines[0]!,
      product_name: 'کالای دیگر',
      review_state: 'unavailable',
    })
    renderPage(order)
    const lines = within(section(/اقلام سفارش/)).getAllByRole('listitem')
    const review = within(lines[0]!).getByRole('link', { name: /ثبت دیدگاه/ })
    expect(review.getAttribute('href')).toBe(
      `/account/reviews/?order=${CODE}&product=${order.lines[0]!.product_slug}`,
    )
    expect(lines[1]).toHaveTextContent('دیدگاه شما ثبت شده')
    expect(within(lines[2]!).queryByRole('link', { name: /دیدگاه/ })).toBeNull()
    expect(lines[2]).not.toHaveTextContent('دیدگاه')
  })

  it('the money, the payments (read on their own), the delivery and the receiver', async () => {
    renderPage(detail('delivered'))
    expect(section('مبلغ سفارش')).toHaveTextContent('۶٬۲۱۲٬۰۰۰ تومان')
    expect(await within(section('پرداخت‌ها')).findByText('زرین پال')).toBeVisible()
    const delivery = section('ارسال')
    expect(delivery).toHaveTextContent('پست پیشتاز')
    expect(delivery).toHaveTextContent('۲ تا ۴ روز کاری')
    expect(delivery).toHaveTextContent('۲۵۸۲۶۴۱۴۸۰۶۱۶۸۲۶۱۵۷۸۳۷۰')
    const receiver = section('گیرنده')
    expect(receiver).toHaveTextContent('سارا احمدی')
    expect(receiver).toHaveTextContent('۰۹۱۲ ۱۲۳ ۴۵۰۱')
    expect(receiver).toHaveTextContent('پلاک ۱۲')
  })

  it('its facts and actions sit in a region named «خلاصهٔ سفارش»', () => {
    renderPage(detail('delivered'))
    const summary = section('خلاصه\u{0654} سفارش')
    expect(summary).toHaveTextContent('تاریخ ثبت')
    expect(within(summary).getByRole('button', { name: 'خرید دوباره' })).toBeVisible()
  })

  it.each([
    [0, 1, 'تحویل تا ۱ روز کاری'],
    [0, 0, 'تحویل در همان روز کاری'],
    [2, 2, 'تحویل در ۲ روز کاری'],
    [null, 3, 'تحویل در ۳ روز کاری'],
  ])('a delivery of %s to %s business days: «%s»', (min, max, text) => {
    renderPage(detail('cod', { delivery_min_days: min, delivery_max_days: max }))
    expect(section('ارسال')).toHaveTextContent(text)
    expect(section('ارسال')).not.toHaveTextContent('۰ تا')
  })

  it('paid on delivery, freight paid by the receiver: both said', () => {
    renderPage(detail('cod', { freight_paid_by_recipient: true }))
    const delivery = section('ارسال')
    expect(delivery).toHaveTextContent('پرداخت در محل')
    expect(delivery).toHaveTextContent('پس‌کرایه')
  })
})

describe('without the server’s read', () => {
  it('the page reads the order itself', async () => {
    serve(mocks.bffFetch, {
      [`order/${CODE}/`]: () => ok(detail('delivered')),
      'payment/history/': () => ok(payments('delivered')),
    })
    renderPage(null)
    expect(await screen.findByRole('heading', { level: 1, name: 'سفارش ۷۰۱۰۸۶۸۵۷۳' })).toBeVisible()
  })

  it('404: «سفارش پیدا نشد», with the way back to the orders', async () => {
    serve(mocks.bffFetch, { [`order/${CODE}/`]: () => refuse(404, 'not_found') })
    renderPage(null)
    expect(await screen.findByRole('heading', { level: 1, name: 'سفارش پیدا نشد' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })
})

describe('cancelled from its page', () => {
  it('the API’s own order is shown at once: cancelled, nothing to pay or cancel', async () => {
    const user = userEvent.setup()
    const order = detail('awaiting')
    const cancelled = detail('awaiting', {
      status: 'cancelled',
      status_display: 'لغو شده',
      is_payable: false,
      can_cancel: false,
      payment_url: null,
    })
    serve(mocks.bffFetch, {
      [`order/${order.order_code}/cancel/`]: () => ok(cancelled),
      'payment/history/': () => ok(payments('delivered')),
    })
    renderPage(order, order.order_code)
    await user.click(screen.getByRole('button', { name: 'لغو سفارش' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    expect(await screen.findByText('لغو شده', { selector: '[data-status]' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'لغو سفارش' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'پرداخت' })).toBeNull()
    expect(screen.getByRole('button', { name: 'خرید دوباره' })).toBeVisible()
  })
})
