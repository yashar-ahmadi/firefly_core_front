import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { wallet } from '../payment/fixtures'
import { address, addressCart, noDestinationCart, tehranOptions } from './fixtures'
import { calls, ok, placeButton, renderCheckout, signedInCart } from './place-support'

// A signed-in shopper's first visit (Task 3's amendment; use-auto-choices.ts): the page posts the
// book's default as the destination and chooses the operator's default shipping by itself, its
// own code; the receiver and shipping steps show their headings over a skeleton meanwhile, so
// the visit goes from the cart to the review loading the review's body alone (the address
// picker's and the options' code load only when the shopper is asked).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
const loaded = vi.hoisted(() => new Set<string>())

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
for (const body of [
  'guest-receiver-form',
  'address-picker',
  'shipping-section',
  'payment-section',
  'review-section',
]) {
  vi.doMock(`@/features/checkout/${body}`, async (importOriginal) => {
    loaded.add(body)
    return importOriginal()
  })
}

stubBrowserApis()

const book = (results: unknown[]) => ({
  count: results.length,
  total_pages: 1,
  current_page: 1,
  page_size: 100,
  next: null,
  previous: null,
  results,
})

describe('a signed-in shopper’s first visit', () => {
  it('the default address and shipping are chosen by the page; the review’s body alone loads', async () => {
    let current = noDestinationCart()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(current))
      if (path === 'account/address/list/') return Promise.resolve(ok(book([address()])))
      if (path === 'cart/destination/') {
        return held.then(() => {
          current = addressCart(address())
          return ok(current)
        })
      }
      if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
      if (path === 'cart/shipping/select/') {
        current = signedInCart()
        return Promise.resolve(ok(current))
      }
      if (path === 'wallet/') return Promise.resolve(ok(wallet()))
      return new Promise(() => {})
    })
    renderCheckout({ cart: noDestinationCart(), hasSession: true })

    // The default address on its way: the receiver step's heading over a named skeleton.
    const receiver = screen.getByRole('region', { name: /گیرنده و آدرس/ })
    expect(
      await within(receiver).findByRole('status', { name: 'در حال انتخاب آدرس پیش\u{200C}فرض' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(calls(mocks.bffFetch, 'cart/destination/')).toHaveLength(1))
    expect(calls(mocks.bffFetch, 'cart/destination/')[0]![1]).toMatchObject({
      body: { address: address().id },
    })
    await act(async () => release())

    // Then the operator's default shipping, then the review.
    await placeButton()
    expect(calls(mocks.bffFetch, 'cart/shipping/select/')).toHaveLength(1)
    expect(calls(mocks.bffFetch, 'cart/shipping/select/')[0]![1]).toMatchObject({
      body: { cash_on_delivery: false },
    })
    expect([...loaded]).toEqual(['review-section'])
  })
})
