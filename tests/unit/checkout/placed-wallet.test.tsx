import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPlaced } from '@/features/checkout/placed-order'
import { findGuestOrder } from '@/features/orders/guest-orders'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, placement } from '../payment/fixtures'
import {
  calls,
  ok,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
  signedInCart,
} from './place-support'

// A signed-in shopper (order digest §5.1, §5.5): the wallet is never chosen for them; chosen, the
// order is paid through the owner's door (`payment/order/<uuid>/intent/`), settled at once: the
// thanks page says so, and the wallet and the account summary are read again.

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

const UUID_INTENT = `payment/order/${placement().uuid}/intent/`

describe('a signed-in checkout', () => {
  it('pays with the wallet when chosen: the owner’s door, settled, the wallet read again', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(() => Promise.resolve(ok(intent('wallet'), 201)))
    serve(mocks.bffFetch, () => signedInCart(), { [PLACE]: placed(), [UUID_INTENT]: pay })
    renderCheckout({ cart: signedInCart(), hasSession: true })
    // The shop's default (the bank) is chosen for the shopper; the wallet is theirs to choose.
    const step = await screen.findByRole('region', { name: /۳.*پرداخت/ })
    await waitFor(() => expect(step).toHaveTextContent('درگاه بانکی'))
    await user.click(within(step).getByRole('button', { name: /ویرایش/ }))
    const wallet = await screen.findByRole('radio', { name: /^کیف پول$/ })
    await waitFor(() => expect(wallet).toBeEnabled())
    expect(screen.getByText('موجودی کیف پول: ۴۵٬۱۷۰٬۰۰۰ تومان')).toBeInTheDocument()
    await user.click(wallet)
    await user.click(screen.getByRole('button', { name: 'ادامه با این روش پرداخت' }))
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    const walletReads = calls(mocks.bffFetch, 'wallet/').length
    await user.click(button)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/checkout/thanks/5592580094/'))
    expect(pay).toHaveBeenCalledWith({ route: 'wallet' }, expect.anything())
    // Signed in: no receiver (the saved address), never a guest order on the device.
    expect(calls(mocks.bffFetch, PLACE)[0]![1].body).toEqual({ expected_total: 2_413_000 })
    expect(findGuestOrder('5592580094')).toBeNull()
    expect(readPlaced('5592580094')).toMatchObject({ outcome: 'paid', guest: false })
    await waitFor(() =>
      expect(calls(mocks.bffFetch, 'wallet/').length).toBeGreaterThan(walletReads),
    )
  })

  it('a frozen wallet: disabled, its freeze message read with it', async () => {
    serve(mocks.bffFetch, () => signedInCart())
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(signedInCart()))
      if (path === 'wallet/') {
        return Promise.resolve(
          ok({
            balance: 9_000_000,
            is_frozen: true,
            freeze_message: 'کیف پول شما موقتاً مسدود شده است.',
          }),
        )
      }
      return new Promise(() => {})
    })
    const user = userEvent.setup()
    renderCheckout({ cart: signedInCart(), hasSession: true })
    const step = await screen.findByRole('region', { name: /۳.*پرداخت/ })
    await waitFor(() => expect(step).toHaveTextContent('درگاه بانکی'))
    await user.click(within(step).getByRole('button', { name: /ویرایش/ }))
    const wallet = await screen.findByRole('radio', { name: /^کیف پول$/ })
    await waitFor(() =>
      expect(wallet).toHaveAccessibleDescription(/کیف پول شما موقتاً مسدود شده است/),
    )
    expect(wallet).toBeDisabled()
  })
})
