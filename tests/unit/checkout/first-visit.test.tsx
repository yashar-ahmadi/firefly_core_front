import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { stubBrowserApis } from '../support/dom-stubs'
import { wallet } from '../payment/fixtures'
import { address, addressCart, noDestinationCart, tehranOptions } from './fixtures'
import { calls, ok, placeButton, renderCheckout, signedInCart } from './place-support'

// A signed-in shopper's first visit (Task 3's amendment; use-auto-choices.ts): the page posts the
// book's default as the destination and chooses the operator's default shipping by itself, its
// own code, so the visit goes from the cart to the review loading the review's body alone (the
// address picker's and the options' code load only when the shopper is asked). The choices made
// on arrival run behind the page's skeleton (Plan 5 Task 8 fix round): shown in their steps, each
// opened and closed a step in turn and moved the steps below (CLS 0.15 on a phone). A choice
// made again later (the shopper changed the address) shows in its step, the page staying.

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

    // The default address on its way: the page's skeleton, no step yet.
    await waitFor(() => expect(calls(mocks.bffFetch, 'cart/destination/')).toHaveLength(1))
    expect(screen.getByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /گیرنده و آدرس/ })).toBeNull()
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

  it('the steps’ page is a screen tall, as its skeleton: the footer stays below the fold', async () => {
    // The review's body arriving after the page's skeleton otherwise pushed a desktop's footer
    // out of view (Plan 5 Task 8 fix round: CLS 0.03 at 1440x900).
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/' ? Promise.resolve(ok(signedInCart())) : new Promise(() => {}),
    )
    renderCheckout({ cart: signedInCart(), hasSession: true })
    const steps = (await screen.findByRole('region', { name: /روش ارسال/ })).parentElement!
    expect(steps.parentElement).toHaveClass('min-h-dvh', 'content-start')
  })

  it('once arrived, a choice made again shows in its step; the page stays', async () => {
    let current = signedInCart()
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(current))
      if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
      if (path === 'wallet/') return Promise.resolve(ok(wallet()))
      return new Promise(() => {})
    })
    const { client } = renderCheckout({ cart: signedInCart(), hasSession: true })
    await placeButton()
    // The shipping choice gone (another address chosen in another tab, say): the operator's
    // default is chosen again, in the shipping step.
    current = addressCart(address())
    await act(async () => client.setQueryData(CART_KEY, current))
    const shipping = screen.getByRole('region', { name: /روش ارسال/ })
    expect(
      await within(shipping).findByRole('status', {
        name: 'در حال انتخاب روش ارسال پیش\u{200C}فرض',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'در حال بارگذاری' })).toBeNull()
  })
})
