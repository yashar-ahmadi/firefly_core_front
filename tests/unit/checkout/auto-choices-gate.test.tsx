import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADDRESSES_KEY } from '@/features/account/addresses/use-addresses'
import { CART_KEY } from '@/features/cart/cart-cache'
import type { Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { emptyCartFixture } from '../cart/fixtures'
import { cartLine } from '../cart/support'
import { wallet } from '../payment/fixtures'
import { address, addressCart, noDestinationCart, tehranOptions } from './fixtures'
import {
  calls,
  ok,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  signedInCart,
} from './place-support'

// The choices the page makes for the shopper (use-auto-choices.ts) only while there is a purchase
// to make: never for an empty cart, a cart whose lines cannot be ordered, or once the order is
// placed (its cart is closed: a write there is a stray 404).

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

const book = (results: unknown[]) => ({ count: results.length, total_pages: 1, results })

function serve(cart: () => Cart, routes: Record<string, () => Promise<unknown>> = {}) {
  mocks.bffFetch.mockImplementation((path: string) => {
    if (path === 'cart/') return Promise.resolve(ok(cart()))
    if (path === 'account/address/list/') return Promise.resolve(ok(book([address()])))
    if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
    if (path === 'wallet/') return Promise.resolve(ok(wallet()))
    if (path === 'cart/destination/') return Promise.resolve(ok(addressCart()))
    const route = routes[path]
    return route ? route() : new Promise(() => {})
  })
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)))
const writes = () =>
  calls(mocks.bffFetch, 'cart/destination/').length +
  calls(mocks.bffFetch, 'cart/shipping/select/').length

describe('the choices made for the shopper', () => {
  it('none for an empty cart', async () => {
    serve(emptyCartFixture)
    renderCheckout({ cart: emptyCartFixture(), hasSession: true })
    expect(await screen.findByText(/سبد خرید شما خالی است/)).toBeInTheDocument()
    await settle()
    expect(writes()).toBe(0)
  })

  it('none for a cart whose lines cannot be ordered', async () => {
    const blocked = () =>
      noDestinationCart({
        is_orderable: false,
        lines: [cartLine({ issue: 'insufficient_stock', available_quantity: 1, quantity: 3 })],
      })
    serve(blocked)
    renderCheckout({ cart: blocked(), hasSession: true })
    await settle()
    await settle()
    expect(writes()).toBe(0)
  })

  it('a blocked cart put right while the page is open: the choice is made then', async () => {
    const blocked = () =>
      noDestinationCart({
        is_orderable: false,
        lines: [cartLine({ issue: 'insufficient_stock', available_quantity: 1, quantity: 3 })],
      })
    let cart = blocked()
    serve(() => cart)
    const { client } = renderCheckout({ cart, hasSession: true })
    // The address book already read (another page of this visit, say).
    client.setQueryData(ADDRESSES_KEY, book([address()]))
    await settle()
    expect(writes()).toBe(0)
    cart = noDestinationCart()
    act(() => client.setQueryData(CART_KEY, cart))
    await waitFor(() => expect(calls(mocks.bffFetch, 'cart/destination/')).toHaveLength(1))
  })

  it('none once the order is placed (its cart is closed)', async () => {
    const user = userEvent.setup()
    let cart = signedInCart()
    serve(() => cart, {
      [PLACE]: async () => {
        // The order closes the cart: the next read is an empty one, with no destination.
        cart = emptyCartFixture()
        return placed()()
      },
    })
    renderCheckout({ cart, hasSession: true })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.click(button)
    await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })
    await settle()
    await settle()
    expect(writes()).toBe(0)
  })
})
