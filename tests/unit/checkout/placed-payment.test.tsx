import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPlaced } from '@/features/checkout/placed-order'
import { RECEIVER_DRAFT_KEY } from '@/features/checkout/receiver-draft'
import { findGuestOrder } from '@/features/orders/guest-orders'
import { getPending, PENDING_KEY } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import notConfigured from '../../fixtures/payment-intent-not-configured.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN, PAYMENT_UUID, placement } from '../payment/fixtures'
import {
  calls,
  ok,
  onlineCart,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
} from './place-support'

// After the order is placed (order digest §5.1–5.4): the guest's order saved on the device, the
// cart read again (the badge empties), the draft and the key forgotten; then the route the
// shopper chose runs at once through the guest's link door. A bank: the pending payment saved
// BEFORE the browser goes, «در حال انتقال به …» and a manual button. The shop's gateway not
// configured (the dev backend's own answer): no navigation, the bank routes gone, the support
// line, the other routes again, each press a new key.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  push: vi.fn(),
  goToBank: vi.fn(),
  loadPage: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.goToBank.mockReset()
  mocks.loadPage.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

async function placeNow(user: ReturnType<typeof userEvent.setup>) {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
}

describe('after placement', () => {
  it('a bank: the pending payment is saved before the browser goes, then the handoff screen', async () => {
    const user = userEvent.setup()
    let pendingWhenLeaving: string | null = null
    mocks.goToBank.mockImplementation(() => {
      pendingWhenLeaving = localStorage.getItem(PENDING_KEY)
    })
    const pay = vi.fn(() => Promise.resolve(ok(intent('bank_gateway'), 201)))
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: placed(), [LINK_INTENT]: pay })
    renderCheckout({ cart: onlineCart() })
    const cartReads = () => calls(mocks.bffFetch, 'cart/').length
    await placeNow(user)
    const before = cartReads()
    expect(await screen.findByText('در حال انتقال به زرین پال…')).toBeInTheDocument()
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
    expect(JSON.parse(pendingWhenLeaving!)[PAYMENT_UUID]).toMatchObject({
      kind: 'order',
      orderCode: '5592580094',
      linkToken: LINK_TOKEN,
      route: 'bank_gateway',
      amount: 1_049_000,
    })
    // The shop's default gateway: no code (the server picks it).
    expect(pay).toHaveBeenCalledWith(
      { route: 'bank_gateway', gateway_code: 'ZARINPAL' },
      expect.anything(),
    )
    // The manual way, for a browser that did not follow.
    await user.click(screen.getByRole('button', { name: 'انتقال به درگاه' }))
    expect(mocks.goToBank).toHaveBeenCalledTimes(2)
    // The purchase is over: the guest's order on the device, the draft gone, the cart read again.
    expect(findGuestOrder('5592580094')).toMatchObject({
      linkToken: LINK_TOKEN,
      A: 1_049_000,
      D: 0,
    })
    expect(sessionStorage.getItem(RECEIVER_DRAFT_KEY)).toBeNull()
    expect(readPlaced('5592580094')).toMatchObject({ guest: true, route: 'bank_gateway' })
    expect(cartReads()).toBeGreaterThanOrEqual(before)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('gateway_not_configured: no navigation, the bank routes gone, support, and a new key per press', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(ApiError.fromBody(503, notConfigured)))
      .mockImplementationOnce(() => Promise.resolve(ok(intent('card_transfer'), 201)))
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: placed(), [LINK_INTENT]: pay })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست')
    expect(within(alert).getByRole('link', { name: /پشتیبانی/ })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect(mocks.goToBank).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
    const routes = screen.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
    expect(within(routes).queryByRole('radio', { name: /درگاه بانکی/ })).not.toBeInTheDocument()
    // How to pay later: the payment link (the guest's) and tracking.
    expect(screen.getByRole('link', { name: 'لینک پرداخت سفارش' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
    await user.click(within(routes).getByRole('radio', { name: /کارت به کارت/ }))
    await user.click(screen.getByRole('button', { name: 'پرداخت سفارش' }))
    // Its URL holds the payment's uuid: a full page load, never the client router.
    await waitFor(() =>
      expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${PAYMENT_UUID}/`),
    )
    expect(mocks.push).not.toHaveBeenCalled()
    const [first, second] = pay.mock.calls.map(
      ([, init]) => (init as { idempotencyKey: string }).idempotencyKey,
    )
    expect(first).toBeTruthy()
    expect(second).not.toBe(first)
    expect(getPending(PAYMENT_UUID)).toMatchObject({
      route: 'card_transfer',
      linkToken: LINK_TOKEN,
    })
  })
})

describe('a pure pay-on-delivery order (A = 0)', () => {
  const codPlacement = () =>
    placed({
      amount_charged_online: 0,
      amount_to_collect_on_delivery: 2_438_000,
      total: 2_438_000,
      requires_online_payment: false,
    })

  it('is confirmed at once (`pay_on_delivery`), then the thanks page', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(() => Promise.resolve(ok(intent('pay_on_delivery', { handoff: null }), 201)))
    const { pureCodCart } = await import('./place-support')
    serve(mocks.bffFetch, pureCodCart, { [PLACE]: codPlacement(), [LINK_INTENT]: pay })
    renderCheckout({ cart: pureCodCart() })
    // No route to choose: the step is done, saying so.
    expect(await placeButton()).toHaveTextContent('ثبت و تأیید سفارش')
    expect(screen.getByRole('region', { name: /۳.*پرداخت/ })).toHaveTextContent(
      'پرداخت در محل (بدون پرداخت آنلاین)',
    )
    await placeNow(user)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/checkout/thanks/5592580094/'))
    expect(pay).toHaveBeenCalledWith({ route: 'pay_on_delivery' }, expect.anything())
    expect(readPlaced('5592580094')).toMatchObject({
      outcome: 'confirmed',
      D: 2_438_000,
      free: false,
    })
  })

  it('a confirmation that fails: the order waits, the thanks page offers it again', async () => {
    const user = userEvent.setup()
    const refusal = new ApiError({
      status: 503,
      code: 'feature_disabled',
      detail: 'پرداخت در محل بسته است.',
      feature: 'pay_on_delivery',
    })
    const { pureCodCart } = await import('./place-support')
    serve(mocks.bffFetch, pureCodCart, {
      [PLACE]: codPlacement(),
      [LINK_INTENT]: () => Promise.reject(refusal),
    })
    renderCheckout({ cart: pureCodCart() })
    await placeNow(user)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/checkout/thanks/5592580094/'))
    expect(readPlaced('5592580094')).toMatchObject({
      outcome: 'unconfirmed',
      failure: 'پرداخت در محل بسته است.',
    })
    expect(placement().order_code).toBe('5592580094')
  })
})
