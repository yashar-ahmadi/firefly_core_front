import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ORDERS_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, placement } from '../payment/fixtures'
import {
  calls,
  ok,
  onlineCart,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
  signedInCart,
} from './place-support'

// A signed-in shopper's «سفارش‌های من» is never left stale by the checkout (Plan 4 Task 10 fix
// round): a placement adds an order to its lists, and a payment that settles in the checkout (the
// wallet, a pay-on-delivery confirmation) changes that order: every key under `ORDERS_KEY` is
// marked stale (no request while no orders page is open). A guest has no such lists.

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

const ordersMarked = (spy: MockInstance<QueryClient['invalidateQueries']>) =>
  spy.mock.calls.filter(
    ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(ORDERS_KEY),
  ).length

const UUID_INTENT = `payment/order/${placement().uuid}/intent/`

describe('the orders after a checkout', () => {
  it('signed in: a placement marks the orders stale (the new order is in their lists)', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => signedInCart(), { [PLACE]: placed() })
    const { client } = renderCheckout({ cart: signedInCart(), hasSession: true })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.click(button)
    await waitFor(() => expect(calls(mocks.bffFetch, PLACE)).toHaveLength(1))
    await waitFor(() => expect(ordersMarked(spy)).toBeGreaterThan(0))
  })

  it('a guest: the orders are not touched', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: placed() })
    const { client } = renderCheckout({ cart: onlineCart() })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.click(button)
    await waitFor(() => expect(calls(mocks.bffFetch, PLACE)).toHaveLength(1))
    await waitFor(() => expect(calls(mocks.bffFetch, 'cart/').length).toBeGreaterThan(1))
    expect(ordersMarked(spy)).toBe(0)
  })

  it('signed in, paid from the wallet: the orders marked stale again once it settled', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(() => Promise.resolve(ok(intent('wallet'), 201)))
    serve(mocks.bffFetch, () => signedInCart(), { [PLACE]: placed(), [UUID_INTENT]: pay })
    const { client } = renderCheckout({ cart: signedInCart(), hasSession: true })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const step = await screen.findByRole('region', { name: /۳.*پرداخت/ })
    await waitFor(() => expect(step).toHaveTextContent('درگاه بانکی'))
    await user.click(within(step).getByRole('button', { name: /ویرایش/ }))
    const wallet = await screen.findByRole('radio', { name: /^کیف پول$/ })
    await waitFor(() => expect(wallet).toBeEnabled())
    await user.click(wallet)
    await user.click(screen.getByRole('button', { name: 'ادامه با این روش پرداخت' }))
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.click(button)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/checkout/thanks/5592580094/'))
    expect(pay).toHaveBeenCalledTimes(1)
    // The placement's, then the payment's.
    expect(ordersMarked(spy)).toBeGreaterThanOrEqual(2)
  })
})
