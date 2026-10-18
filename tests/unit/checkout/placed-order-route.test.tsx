import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { handoff, intent, LINK_TOKEN, placement } from '../payment/fixtures'
import {
  calls,
  ok,
  onlineCart,
  PLACE,
  placeButton,
  pureCodCart,
  renderCheckout,
  serve,
} from './place-support'

// The route run after placement follows the ORDER, not the cart it was chosen for (order digest
// §5.2 step 5, §5.3): the order's own online share (A) can differ from the cart's (a price, a
// fee changed in between). Nothing owed online → the confirmation (`pay_on_delivery`), whatever
// was chosen; something owed online after a confirmation was chosen → no doomed intent: the
// routes for the order's amounts, the shopper chooses.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

async function placeNow(user: ReturnType<typeof userEvent.setup>) {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
}

describe('the route after placement follows the order', () => {
  it('the bank chosen, but the order owes nothing online: it is confirmed instead', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(async () => ok(intent('pay_on_delivery', { handoff: null }), 201))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: async () =>
        ok(
          placement({
            amount_charged_online: 0,
            amount_to_collect_on_delivery: 1_049_000,
            requires_online_payment: false,
          }),
          201,
        ),
      [LINK_INTENT]: pay,
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(1))
    expect(pay).toHaveBeenCalledWith({ route: 'pay_on_delivery' }, expect.anything())
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/checkout/thanks/5592580094/'))
  })

  it('a bank handoff that expired: the routes again, nothing running, a new press pays', async () => {
    const user = userEvent.setup()
    const expired = new Date(Date.now() - 1000).toISOString()
    const pay = vi
      .fn()
      .mockImplementationOnce(async () =>
        ok(intent('bank_gateway', { handoff: handoff({ expires_at: expired }) }), 201),
      )
      .mockImplementationOnce(async () => ok(intent('bank_gateway'), 201))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: async () => ok(placement(), 201),
      [LINK_INTENT]: pay,
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    // The bank's handoff screen, then its time is up: the order again.
    expect(await screen.findByText(/در حال انتقال به/)).toBeInTheDocument()
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent(
      'مهلت انتقال به درگاه تمام شد',
    )
    const panel = screen.getByRole('region', { name: 'سفارش شما ثبت شد' })
    // Not «preparing» any more: the routes and the button work.
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    const button = within(panel).getByRole('button', { name: 'پرداخت سفارش' })
    expect(button).toBeEnabled()
    expect(within(panel).getByRole('radio', { name: /درگاه بانکی/ })).toBeEnabled()
    await user.click(button)
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(2))
  }, 15_000)

  it('a confirmation chosen, but the order owes something online: the routes for the order', async () => {
    const user = userEvent.setup()
    const pay = vi.fn<(body: unknown, init: unknown) => Promise<unknown>>(async () =>
      ok(intent('bank_gateway'), 201),
    )
    serve(mocks.bffFetch, pureCodCart, {
      [PLACE]: async () =>
        ok(
          placement({
            amount_charged_online: 70_000,
            amount_to_collect_on_delivery: 2_368_000,
            requires_online_payment: true,
          }),
          201,
        ),
      [LINK_INTENT]: pay,
    })
    renderCheckout({ cart: pureCodCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'سفارش شما ثبت شد' })
    // No doomed confirmation: the order's routes, its own online share, the shopper's press.
    const routes = await within(panel).findByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
    expect(within(routes).getByRole('radio', { name: /درگاه بانکی/ })).toBeChecked()
    expect(panel).toHaveTextContent('۷۰٬۰۰۰ تومان')
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(calls(mocks.bffFetch, LINK_INTENT)).toHaveLength(0)
    await user.click(within(panel).getByRole('button', { name: 'پرداخت سفارش' }))
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(1))
    expect(pay.mock.calls[0]![0]).toMatchObject({ route: 'bank_gateway' })
  })
})
