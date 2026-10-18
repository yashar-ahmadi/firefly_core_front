import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import cancelledLink from '../../fixtures/order-pay-link-cancelled.json'
import cancelledAttempt from '../../fixtures/payment-attempt-cancel.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { bankAttempt, payLink } from './link-fixtures'
import {
  LINK_CANCEL,
  LINK_INTENT,
  LINK_READ,
  ok,
  renderLink,
  routesReady,
  serve,
  type Route,
} from './pay-link-support'

// The payment link page's other ways (order digest §3.2.4, §3.1.10, §8.2–8.3): a signed-in
// visitor may pay a guest order from their wallet, never another account's (403
// `payment_forbidden`: said, the wallet routes withdrawn); «لغو سفارش» asks first (the safe
// choice focused), sends the optional reason once, and shows the cancelled order; an order that
// moved on meanwhile (paid elsewhere) is read again and the page says why it no longer opens.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('next/navigation', () => ({
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  localStorage.clear()
})

const routes = () => screen.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })

describe('the wallet on the payment link', () => {
  it('a signed-in visitor gets the wallet; another account’s order refuses it (said, withdrawn)', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [LINK_INTENT]: () =>
        Promise.reject(
          new ApiError({ status: 403, code: 'payment_forbidden', detail: 'اجازه ندارید.' }),
        ),
    })
    renderLink({ hasSession: true })
    await routesReady()
    const wallet = await within(routes()).findByRole('radio', { name: /^کیف پول(?! و)/ })
    await waitFor(() => expect(wallet).toBeEnabled())
    expect(screen.queryByRole('link', { name: 'ورود برای استفاده از کیف پول' })).toBeNull()
    await user.click(wallet)
    await user.click(screen.getByRole('button', { name: 'پرداخت سفارش' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('متعلق به حساب کاربری دیگری است')
    expect(within(routes()).queryByRole('radio', { name: /کیف پول/ })).not.toBeInTheDocument()
    expect(within(routes()).getByRole('radio', { name: /کارت به کارت/ })).toBeInTheDocument()
  })
})

describe('«لغو سفارش»', () => {
  it('asks first (focus on «بازگشت»), sends the reason once, then shows the cancelled order', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn<Route>(async () => ok(cancelledLink.data))
    serve(mocks.bffFetch, { [LINK_CANCEL]: cancel })
    renderLink()
    await routesReady()
    await user.click(screen.getByRole('button', { name: 'لغو سفارش' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    expect(within(dialog).getByRole('button', { name: 'بازگشت' })).toHaveFocus()
    expect(cancel).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText(/دلیل لغو/), '  دیگر لازم ندارم  ')
    await user.dblClick(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    expect(await screen.findByRole('heading', { name: 'سفارش لغو شد' })).toHaveFocus()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel.mock.calls[0]![0]).toEqual({ reason: 'دیگر لازم ندارم' })
  })

  it('«بازگشت» closes it with nothing sent; a refusal of the cancellation stays in the dialog', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn(() =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: 'order_cancellation_not_allowed',
          detail: 'این سفارش در این مرحله قابل لغو نیست.',
        }),
      ),
    )
    serve(mocks.bffFetch, { [LINK_CANCEL]: cancel })
    renderLink()
    await routesReady()
    await user.click(screen.getByRole('button', { name: 'لغو سفارش' }))
    let dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cancel).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'لغو سفارش' }))
    dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('قابل لغو نیست')
    expect(screen.getByRole('dialog')).toBeVisible()
  })
})

describe('an order that moved on meanwhile', () => {
  it('a press finds it paid elsewhere: it is read again, and the page says why', async () => {
    const user = userEvent.setup()
    const settled = () =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: 'order_already_settled',
          detail: 'برای این سفارش مبلغ پرداخت\u{200C}نشده\u{200C}ای باقی نمانده است.',
        }),
      )
    serve(mocks.bffFetch, { [LINK_INTENT]: settled, [LINK_READ]: settled })
    renderLink()
    await routesReady()
    await user.click(screen.getByRole('button', { name: 'پرداخت سفارش' }))
    expect(
      await screen.findByRole('heading', { name: 'پرداخت آنلاین این سفارش انجام شده' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(mocks.bffFetch.mock.calls.filter(([path]) => path === LINK_READ)).toHaveLength(1)
  })
})

describe('after an open attempt is abandoned', () => {
  it('the routes take its place and the focus goes to their heading', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [`payment/${PAYMENT_UUID}/cancel/`]: async () => ok(cancelledAttempt.data),
    })
    renderLink({ link: payLink({ open_attempt: bankAttempt() }) })
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await routesReady()
    expect(screen.getByRole('heading', { level: 2, name: 'روش پرداخت' })).toHaveFocus()
  })
})
