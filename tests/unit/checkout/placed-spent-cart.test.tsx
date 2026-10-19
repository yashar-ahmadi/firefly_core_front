import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  calls,
  onlineCart,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
  signedInCart,
} from './place-support'

// After a placement the cart is spent: the API has no cart to price any more, so its shipping
// options are never read again (`GET cart/shipping/option/list/` answers 404 `cart_not_found`
// then: a console error on every placement). The cart itself is read again (now empty). Plan 4
// Task 10: shirin's live wallet order met that 404 as the checkout handed over to the thanks
// page (the review's delivery line keeps the options query on).

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

const OPTIONS = 'cart/shipping/option/list/'

async function placeAndCount(cart: () => Cart, hasSession: boolean) {
  const user = userEvent.setup()
  serve(mocks.bffFetch, cart, { [PLACE]: placed() })
  renderCheckout({ cart: cart(), hasSession })
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await waitFor(() => expect(calls(mocks.bffFetch, OPTIONS).length).toBeGreaterThan(0))
  const options = calls(mocks.bffFetch, OPTIONS).length
  const carts = calls(mocks.bffFetch, 'cart/').length
  await user.click(button)
  await waitFor(() => expect(calls(mocks.bffFetch, PLACE)).toHaveLength(1))
  // The cart read again (the placement spent it)…
  await waitFor(() => expect(calls(mocks.bffFetch, 'cart/').length).toBeGreaterThan(carts))
  // …and its options never: the API has no cart to price.
  expect(calls(mocks.bffFetch, OPTIONS)).toHaveLength(options)
}

describe('a placement spends the cart', () => {
  it('signed in (the review’s delivery line on): no shipping options read after it', async () => {
    await placeAndCount(() => signedInCart(), true)
  })

  it('a guest: no shipping options read after it', async () => {
    await placeAndCount(() => onlineCart(), false)
  })
})
