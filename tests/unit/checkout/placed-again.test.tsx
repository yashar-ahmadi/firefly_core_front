import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLACEMENT_KEY_STORAGE } from '@/features/checkout/idempotency'
import { contextOf, readPlaced, savePlaced } from '@/features/checkout/placed-order'
import { findGuestOrder } from '@/features/orders/guest-orders'
import { stubBrowserApis } from '../support/dom-stubs'
import { emptyCartFixture } from '../cart/fixtures'
import { placement } from '../payment/fixtures'
import { calls, ok, onlineCart, PLACE, placeButton, renderCheckout, serve } from './place-support'

// An order placed in this tab, met again: the checkout opened again with the cart it emptied (a
// reload, Back from the bank) shows that order first; and a placement key whose 2xx was lost,
// sent again for another cart, meets that earlier order (a 200 replay of another total): it is
// said and recorded, never taken for the purchase on screen (order digest §5.1).

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

describe('an order placed in this tab, met again', () => {
  it('the checkout opened again with its emptied cart: that order, and the way to its page', async () => {
    savePlaced(contextOf(placement(), { guest: true, route: 'bank_gateway', gatewayCode: null }))
    serve(mocks.bffFetch, emptyCartFixture)
    renderCheckout({ cart: emptyCartFixture(), draft: false })
    expect(await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
    expect(screen.getByText(/۵۵۹۲۵۸۰۰۹۴/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} سفارش' })).toHaveAttribute(
      'href',
      '/checkout/thanks/5592580094/',
    )
    expect(screen.queryByText('سبد خرید شما خالی است')).not.toBeInTheDocument()
  })

  it('a replay of an earlier order for another cart: said, recorded, the next press places this cart', async () => {
    const user = userEvent.setup()
    const place = vi
      .fn()
      // The key's earlier order (its 2xx was lost), of another total: a 200.
      .mockImplementationOnce(async () => ok(placement({ total: 999_000 }), 200))
      .mockImplementationOnce(async () => ok(placement({ order_code: '5592580095' }), 201))
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: place })
    renderCheckout({ cart: onlineCart() })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    const first = sessionStorage.getItem(PLACEMENT_KEY_STORAGE)
    await user.click(button)
    const review = screen.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
    const notice = await within(review).findByText(/پیش\u{200C}تر با همین خرید ثبت شده بود/u)
    expect(notice).toHaveTextContent('۵۵۹۲۵۸۰۰۹۴')
    expect(within(review).getByRole('link', { name: 'مشاهده\u{0654} آن سفارش' })).toHaveAttribute(
      'href',
      '/checkout/thanks/5592580094/',
    )
    // Not this purchase: no placed panel; that order recorded; a new key for this cart.
    expect(screen.queryByRole('heading', { name: 'سفارش شما ثبت شد' })).not.toBeInTheDocument()
    expect(readPlaced('5592580094')).not.toBeNull()
    expect(findGuestOrder('5592580094')).not.toBeNull()
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBeNull()
    await user.click(await placeButton())
    expect(await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
    const keys = calls(mocks.bffFetch, PLACE).map(([, init]) => init.idempotencyKey)
    expect(keys[0]).toBe(first)
    expect(keys[1]).not.toBe(first)
  })
})
