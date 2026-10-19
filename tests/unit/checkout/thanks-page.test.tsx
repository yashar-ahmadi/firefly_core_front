import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  contextOf,
  readPlaced,
  savePlaced,
  type PlacedContext,
} from '@/features/checkout/placed-order'
import { ThanksPage } from '@/features/checkout/thanks/thanks-page'
import { saveGuestOrder } from '@/features/orders/guest-orders'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { intent, LINK_TOKEN, placement } from '../payment/fixtures'

// `/checkout/thanks/<code>/` (spec §8.7; order digest §5.1–5.2): what this tab knows of the order
// just placed, never more than the server said. A guest: the code to copy (left to right), the
// payment link and deadline while something may be owed, tracking by code and mobile, never "in
// your account". Signed in: the order in the account. A failed pay-on-delivery confirmation is
// offered again. Opened without this tab's record: a calm page with the ways to find the order.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/thanks/5592580094/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

const CODE = '5592580094'

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

function context(changes: Partial<PlacedContext> = {}, guest = true): PlacedContext {
  const ctx = contextOf(placement(), { guest, route: 'bank_gateway', gatewayCode: null })
  return { ...ctx, ...changes }
}

function renderThanks(hasSession = false) {
  const { wrapper } = clientProviders({ hasSession })
  return render(<ThanksPage code={CODE} supportPhone="+982191000000" />, { wrapper })
}

describe('ThanksPage', () => {
  it('a guest’s order awaiting payment: the code, the payment link, the deadline, tracking', async () => {
    savePlaced(context())
    renderThanks()
    expect(await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
    expect(document.querySelector('[data-order-code]')).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('۵۵۹۲۵۸۰۰۹۴')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'لینک پرداخت سفارش' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
    // The deadline, as the API gave it, with the time left.
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      placement().payment_expires_at,
    )
    expect(
      screen.getByRole('link', { name: /پیگیری سفارش با کد سفارش و شماره\u{0654} موبایل/u }),
    ).toHaveAttribute('href', '/order/track/')
    expect(document.body).not.toHaveTextContent('حساب کاربری')
  })

  it('a confirmed pay-on-delivery order: the amount paid at the door; the free wording', async () => {
    savePlaced(context({ outcome: 'confirmed', D: 2_438_000 }))
    const view = renderThanks()
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toBeInTheDocument()
    // Said once, in the title: the body says what comes next.
    expect(document.body).toHaveTextContent(
      'مبلغ ۲٬۴۳۸٬۰۰۰ تومان هنگام تحویل پرداخت می\u{200C}شود.',
    )
    expect(screen.getAllByText(/سفارش شما تأیید شد/)).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'لینک پرداخت سفارش' })).not.toBeInTheDocument()
    view.unmount()
    savePlaced(context({ outcome: 'confirmed', free: true, D: 0 }))
    renderThanks()
    expect(await screen.findByText(/سفارش رایگان شما ثبت و تأیید شد/)).toBeInTheDocument()
  })

  it('a confirmation that failed: «تأیید سفارش» again (a new key), then confirmed', async () => {
    const user = userEvent.setup()
    savePlaced(
      context({
        outcome: 'unconfirmed',
        route: 'pay_on_delivery',
        failure: 'خطا.',
        A: 0,
        D: 2_438_000,
      }),
    )
    mocks.bffFetch
      .mockRejectedValueOnce(
        new ApiError({ status: 503, code: 'gateway_unavailable', detail: 'x' }),
      )
      .mockResolvedValueOnce({ data: intent('pay_on_delivery'), msg: '', status: 201 })
    renderThanks()
    expect(
      await screen.findByRole('heading', { name: 'سفارش ثبت شد اما هنوز تأیید نشده است' }),
    ).toBeInTheDocument()
    // Nothing is paid online: its link confirms it, before the deadline to confirm.
    expect(document.body).toHaveTextContent(
      'تا پایان مهلت، این سفارش را با لینک آن هم می\u{200C}توانید تأیید کنید',
    )
    expect(document.body).toHaveTextContent('مهلت تأیید:')
    expect(document.body).not.toHaveTextContent(/مهلت پرداخت|پرداخت کنید/)
    await user.click(screen.getByRole('button', { name: 'تأیید سفارش' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('درگاه بانک پاسخ نداد')
    await user.click(screen.getByRole('button', { name: 'تأیید سفارش' }))
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toBeInTheDocument()
    const [first, second] = mocks.bffFetch.mock.calls
    expect(first![0]).toBe(`payment/link/${LINK_TOKEN}/intent/`)
    expect(first![1].body).toEqual({ route: 'pay_on_delivery' })
    expect(second![1].idempotencyKey).not.toBe(first![1].idempotencyKey)
    expect(readPlaced(CODE)?.outcome).toBe('confirmed')
  })

  it('signed in: the order in the account, never the guest’s link', async () => {
    savePlaced(context({ outcome: 'paid' }, false))
    renderThanks(true)
    expect(await screen.findByRole('heading', { name: 'سفارش شما پرداخت شد' })).toBeInTheDocument()
    // The order's status in the API's own word («در حال انجام»), as the result page says it.
    expect(document.body).toHaveTextContent(
      'پرداخت با کیف پول انجام شد و سفارش شما در حال انجام است.',
    )
    expect(
      screen.getByRole('link', { name: 'مشاهده\u{0654} سفارش در حساب کاربری' }),
    ).toHaveAttribute('href', `/account/orders/${CODE}/`)
    expect(screen.queryByRole('link', { name: 'لینک پرداخت سفارش' })).not.toBeInTheDocument()
  })

  it('a guest order found on this device only: its link, no claim about its payment', async () => {
    const { linkToken, paymentUrl, expiresAt, A, D, placedAt } = context()
    saveGuestOrder({
      orderCode: CODE,
      linkToken: linkToken!,
      paymentUrl: paymentUrl!,
      expiresAt,
      A,
      D,
      placedAt,
    })
    renderThanks()
    expect(await screen.findByRole('heading', { name: 'سفارش ۵۵۹۲۵۸۰۰۹۴' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'لینک پرداخت سفارش' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/تأیید شد|پرداخت شد|در انتظار پرداخت/)
  })

  it('opened without any record (another device): a calm page, no claim, the ways to find it', async () => {
    renderThanks()
    const heading = await screen.findByRole('heading', { name: 'سفارش ۵۵۹۲۵۸۰۰۹۴' })
    const page = heading.closest('section')!
    expect(page).toHaveTextContent('جزئیات این سفارش در این مرورگر در دسترس نیست')
    expect(page).not.toHaveTextContent(/تأیید شد|پرداخت شد|ثبت شد/)
    expect(within(page).getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    await waitFor(() => expect(mocks.bffFetch).not.toHaveBeenCalled())
  })
})
