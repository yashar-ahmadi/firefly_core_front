import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useUpdateCartLine } from '@/features/cart/hooks'
import { useCheckout } from '@/features/checkout/use-checkout'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { cartNotFoundBody, emptyCartFixture } from '../cart/fixtures'
import { deferred } from '../cart/support'
import { ok, setup, withFeatures, type Answer } from './checkout-hook-support'
import { address, addressCart, destinationCart, noDestinationCart } from './fixtures'

// The checkout's cart writes (use-checkout-writes): in the cart writes' scope after a quantity
// change still on its way, a queue of choices collapsed to the one in flight and the last one,
// and a guest cart that is gone read again (empty), the write never replayed.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('useCheckout writes', () => {
  it('a guest cart that is gone (404 cart_not_found): read again, empty; never sent again', async () => {
    let gone = false
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/')
        return Promise.resolve(ok(gone ? emptyCartFixture() : noDestinationCart()))
      if (path === 'cart/destination/') {
        gone = true
        return Promise.reject(ApiError.fromBody(404, cartNotFoundBody()))
      }
      return new Promise(() => {})
    })
    const { result } = setup(noDestinationCart(), false)
    const outcome = await act(() => result.current.checkout.setDestinationByCity(8, 301))
    expect(outcome.status).toBe('failed')
    await waitFor(() => expect(result.current.checkout.cart?.is_empty).toBe(true))
    const sent = mocks.bffFetch.mock.calls.filter(([path]) => path === 'cart/destination/')
    expect(sent).toHaveLength(1)
  })

  it('wait for a quantity change still on its way (the cart writes’ scope), then land last', async () => {
    const put = deferred<Answer>()
    const after = destinationCart()
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/destination/') return Promise.resolve(ok(after))
      if (path === 'cart/') return Promise.resolve(ok(noDestinationCart()))
      if (path === 'cart/shipping/option/list/') return new Promise(() => {})
      return put.promise
    })
    const line = noDestinationCart().lines[0]!
    const providers = withFeatures()
    providers.client.setQueryData(CART_KEY, noDestinationCart())
    const { result } = renderHook(
      () => ({ line: useUpdateCartLine(line), checkout: useCheckout() }),
      { wrapper: providers.wrapper },
    )
    act(() => result.current.line.setQuantity(3))
    await waitFor(
      () =>
        expect(mocks.bffFetch).toHaveBeenCalledWith(
          `cart/item/${line.variant_id}/`,
          expect.anything(),
        ),
      { timeout: 2000 },
    )
    let setting!: Promise<unknown>
    act(() => {
      setting = result.current.checkout.setDestinationByCity(8, 301)
    })
    const paths = () => mocks.bffFetch.mock.calls.map(([path]) => path).filter((p) => p !== 'cart/')
    expect(paths()).not.toContain('cart/destination/')
    await act(async () => put.resolve(ok(noDestinationCart({ item_count: 4 }))))
    await act(() => setting)
    expect(paths().indexOf('cart/destination/')).toBeGreaterThan(
      paths().indexOf(`cart/item/${line.variant_id}/`),
    )
    expect(providers.client.getQueryData(CART_KEY)).toEqual(after)
  })

  it('a choice overtaken by a newer one while queued is never sent', async () => {
    const first = deferred<Answer>()
    mocks.bffFetch.mockImplementation((path: string, init?: { body?: { address?: number } }) => {
      if (path === 'cart/') return Promise.resolve(ok(noDestinationCart()))
      if (path !== 'cart/destination/') return new Promise(() => {})
      const id = init?.body?.address
      return id === 1 ? first.promise : Promise.resolve(ok(addressCart(address({ id: id! }))))
    })
    const sent = () =>
      mocks.bffFetch.mock.calls
        .filter(([path]) => path === 'cart/destination/')
        .map(([, init]) => (init as { body: { address: number } }).body.address)
    const { result, client } = setup(noDestinationCart(), true)
    const choose = (id: number) => result.current.checkout.setDestinationByAddress(id)
    let all!: Promise<unknown>
    // Arrow keys through the addresses: the first choice is on its way, two more queue behind it.
    act(() => void (all = choose(1)))
    await waitFor(() => expect(sent()).toEqual([1]))
    act(() => void (all = Promise.all([all, choose(2), choose(3)])))
    await act(async () => first.resolve(ok(addressCart(address({ id: 1 })))))
    await act(() => all)
    expect(sent()).toEqual([1, 3])
    await waitFor(() =>
      expect(client.getQueryData<Cart>(CART_KEY)?.destination?.address?.id).toBe(3),
    )
  })
})
