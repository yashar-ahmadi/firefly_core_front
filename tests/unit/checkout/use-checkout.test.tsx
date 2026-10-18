import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { readReceiverDraft, RECEIVER_DRAFT_KEY } from '@/features/checkout/receiver-draft'
import type { Cart } from '@/lib/api/types/cart'
import { serve, setup, VALID_RECEIVER } from './checkout-hook-support'
import { address, addressCart, codCart, destinationCart, noDestinationCart } from './fixtures'

// The checkout's state (Plan 4 Task 2): derived from the cart the API returns (destination set?
// shipping selected and available?) plus the page's own state (a guest's receiver, a step the
// shopper reopened). Every write runs in the cart writes' scope and stores the cart it returns.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
}))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.replace.mockReset()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/checkout/')
})

afterEach(() => window.history.replaceState(null, '', '/'))

describe('useCheckout, signed in', () => {
  it('goes to `shipping` once the destination by address succeeds', async () => {
    const saved = address()
    serve(mocks.bffFetch, noDestinationCart, { 'cart/destination/': () => addressCart(saved) })
    const { result, client } = setup(noDestinationCart(), true)
    expect(result.current.checkout.step).toBe('receiver')
    expect(result.current.checkout.destinationReady).toBe(false)
    await act(() => result.current.checkout.setDestinationByAddress(saved.id))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/destination/', {
      method: 'POST',
      body: { address: saved.id },
    })
    expect(client.getQueryData<Cart>(CART_KEY)?.destination?.address?.id).toBe(saved.id)
    // (The cart's observers hear of the stored cart on the next tick.)
    await waitFor(() => expect(result.current.checkout.destinationReady).toBe(true))
    expect(result.current.checkout.step).toBe('shipping')
  })

  it('a destination without a saved address (a guest’s, kept by a merge) is not one yet', () => {
    serve(mocks.bffFetch, destinationCart)
    const { result } = setup(destinationCart(), true)
    expect(result.current.checkout.destinationReady).toBe(false)
    expect(result.current.checkout.step).toBe('receiver')
  })

  it('shipping is ready when the cart says it is selected and available, never otherwise', () => {
    serve(mocks.bffFetch, codCart)
    const selected = setup(addressCart(address(), { shipping: codCart().shipping }), true)
    expect(selected.result.current.checkout.shippingReady).toBe(true)
    expect(selected.result.current.checkout.step).toBe('payment')
    const stale = { ...codCart().shipping, is_available: false, reason: 'غیرفعال شد.' }
    const again = setup(addressCart(address(), { shipping: stale }), true)
    expect(again.result.current.checkout.shippingReady).toBe(false)
    expect(again.result.current.checkout.step).toBe('shipping')
  })

  it('«ویرایش» reopens a done step until a choice is made there', async () => {
    serve(mocks.bffFetch, () => addressCart(), {
      'cart/destination/': () => addressCart(address({ id: 7 })),
    })
    const { result } = setup(addressCart(), true)
    expect(result.current.checkout.step).toBe('shipping')
    act(() => result.current.checkout.edit('receiver'))
    expect(result.current.checkout.step).toBe('receiver')
    await act(() => result.current.checkout.setDestinationByAddress(7))
    expect(result.current.checkout.step).toBe('shipping')
  })

  it('after a login (merge) the cart has no destination and no choice: back to the receiver', async () => {
    // The merged cart (cart digest §3.11): the guest's destination and shipping choice dropped.
    let cart = codCart()
    serve(mocks.bffFetch, () => cart)
    const { result, client } = setup(cart, false)
    cart = noDestinationCart()
    act(() => result.current.session.setHasSession(true))
    await act(() => client.invalidateQueries({ queryKey: CART_KEY }))
    await waitFor(() => expect(result.current.checkout.shippingReady).toBe(false))
    expect(result.current.checkout.signedIn).toBe(true)
    expect(result.current.checkout.step).toBe('receiver')
  })

  it('a session that ends on the page: the signed-in part is over (login is the way on)', () => {
    serve(mocks.bffFetch, () => addressCart())
    const { result } = setup(addressCart(), true)
    act(() => result.current.session.setHasSession(false))
    expect(result.current.checkout.sessionEnded).toBe(true)
  })
})

describe('useCheckout, guest', () => {
  it('posts the province and city, and goes on once the receiver is confirmed', async () => {
    serve(mocks.bffFetch, noDestinationCart, { 'cart/destination/': destinationCart })
    const { result } = setup(noDestinationCart(), false)
    act(() => result.current.checkout.setReceiver(VALID_RECEIVER))
    await act(() => result.current.checkout.setDestinationByCity(8, 301))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/destination/', {
      method: 'POST',
      body: { province: 8, city: 301 },
    })
    // (The cart's observers hear of the stored cart on the next tick.)
    await waitFor(() => expect(result.current.checkout.destinationReady).toBe(true))
    // Shipping can price now, but the receiver is still being filled in.
    expect(result.current.checkout.step).toBe('receiver')
    act(() => result.current.checkout.confirmReceiver())
    expect(result.current.checkout.step).toBe('shipping')
    expect(result.current.checkout.sessionEnded).toBe(false)
  })

  it('keeps the receiver in the tab (sessionStorage) and restores it after a reload', async () => {
    serve(mocks.bffFetch, destinationCart)
    const first = setup(destinationCart(), false)
    act(() => first.result.current.checkout.setReceiver(VALID_RECEIVER))
    act(() => first.result.current.checkout.confirmReceiver())
    expect(readReceiverDraft()).toMatchObject({ confirmed: true, values: VALID_RECEIVER })
    first.unmount()
    const again = setup(destinationCart(), false)
    await waitFor(() => expect(again.result.current.checkout.receiver.firstName).toBe('سارا'))
    expect(again.result.current.checkout.step).toBe('shipping')
  })

  it('forgets the draft once the tab is signed in', async () => {
    sessionStorage.setItem(
      RECEIVER_DRAFT_KEY,
      JSON.stringify({ values: VALID_RECEIVER, confirmed: true }),
    )
    serve(mocks.bffFetch, noDestinationCart)
    setup(noDestinationCart(), true)
    await waitFor(() => expect(sessionStorage.getItem(RECEIVER_DRAFT_KEY)).toBeNull())
  })

  it('a draft for another city than the cart’s is not a done receiver', () => {
    sessionStorage.setItem(
      RECEIVER_DRAFT_KEY,
      JSON.stringify({ values: { ...VALID_RECEIVER, city: 313 }, confirmed: true }),
    )
    serve(mocks.bffFetch, destinationCart)
    const { result } = setup(destinationCart(), false)
    expect(result.current.checkout.step).toBe('receiver')
  })
})
