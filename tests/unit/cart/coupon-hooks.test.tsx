import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useClearCart } from '@/features/cart/clear-hooks'
import { normaliseCouponCode, useApplyCoupon, useRemoveCoupon } from '@/features/cart/coupon-hooks'
import { useUpdateCartLine } from '@/features/cart/hooks'
import type { Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import { couponCartFixture, emptyCartFixture, itemsCartFixture } from './fixtures'
import { deferred } from './support'

// The cart page's own writes (ruling P4-R1: modules of their own, out of the mini-cart's and the
// catalog's code): they run in the cart writes' scope (one at a time, in order, with the
// stepper's PUTs and the removals) and store the cart they get back.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { success: mocks.success, error: mocks.error, info: vi.fn(), dismiss: vi.fn() },
}))

type Answer = { data: Cart; msg: string; status: number }
const ok = (data: Cart, msg = ''): Answer => ({ data, msg, status: 200 })

function setup<T>(hook: () => T, cached: Cart = itemsCartFixture()) {
  const { client, wrapper } = clientProviders()
  client.setQueryData(CART_KEY, cached)
  return { ...renderHook(hook, { wrapper }), client }
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.success.mockReset()
  mocks.error.mockReset()
})

describe('normaliseCouponCode', () => {
  it('reads a code as the API does: Latin digits, no outer spaces, upper case', () => {
    expect(normaliseCouponCode(' tea۳۰ ')).toBe('TEA30')
    expect(normaliseCouponCode('free٢٠ship')).toBe('FREE20SHIP')
    expect(normaliseCouponCode('   ')).toBe('')
  })
})

describe('the cart page’s writes', () => {
  it('a coupon waits for a quantity change still on its way, then lands last', async () => {
    const put = deferred<Answer>()
    const applied = couponCartFixture()
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/coupon/apply/' ? Promise.resolve(ok(applied)) : put.promise,
    )
    const line = itemsCartFixture().lines[0]!
    const { result, client } = setup(() => ({
      line: useUpdateCartLine(line),
      coupon: useApplyCoupon(),
    }))
    act(() => result.current.line.setQuantity(3))
    // The stepper's PUT goes once its debounce is over, and stays on its way.
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1), { timeout: 2000 })
    let applying!: Promise<unknown>
    act(() => {
      applying = result.current.coupon.apply('TEA30')
    })
    // Queued behind the PUT: not sent yet.
    expect(mocks.bffFetch.mock.calls.map(([path]) => path)).toEqual(['cart/item/10119/'])
    await act(async () => put.resolve(ok(itemsCartFixture({ item_count: 4 }))))
    await act(() => applying)
    expect(mocks.bffFetch.mock.calls.map(([path]) => path)).toEqual([
      'cart/item/10119/',
      'cart/coupon/apply/',
    ])
    expect(client.getQueryData(CART_KEY)).toEqual(applied)
  })

  it('removing the coupon stores the returned cart; a refusal is said and the cart read again', async () => {
    mocks.bffFetch.mockResolvedValueOnce(ok(itemsCartFixture(), 'کوپن تخفیف حذف شد.'))
    const { result, client } = setup(() => useRemoveCoupon(), couponCartFixture())
    await act(() => result.current.remove())
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/coupon/remove/', { method: 'DELETE' })
    expect(client.getQueryData<Cart>(CART_KEY)?.coupon.code).toBeNull()
    expect(mocks.success).toHaveBeenCalledWith('کوپن تخفیف حذف شد.')

    mocks.bffFetch.mockRejectedValueOnce(new TypeError('offline'))
    let removed: boolean | undefined
    await act(async () => {
      removed = await result.current.remove()
    })
    expect(removed).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith('خطایی رخ داد. لطفاً دوباره تلاش کنید.')
    await waitFor(() => expect(client.getQueryState(CART_KEY)?.isInvalidated).toBe(true))
  })

  it('clearing stores the empty cart the API returned, with its message', async () => {
    mocks.bffFetch.mockResolvedValue(ok(emptyCartFixture(), 'سبد خرید خالی شد.'))
    const { result, client } = setup(() => useClearCart())
    let cleared: boolean | undefined
    await act(async () => {
      cleared = await result.current.clear()
    })
    expect(cleared).toBe(true)
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/clear/', { method: 'DELETE' })
    expect(client.getQueryData<Cart>(CART_KEY)?.is_empty).toBe(true)
    expect(mocks.success).toHaveBeenCalledWith('سبد خرید خالی شد.')
  })
})
