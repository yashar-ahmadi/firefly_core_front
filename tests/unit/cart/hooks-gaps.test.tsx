import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showAddedToCartToast } from '@/features/cart/components/added-to-cart-toast'
import { MiniCartLine } from '@/features/cart/components/mini-cart-line'
import {
  CART_KEY,
  QUANTITY_DEBOUNCE_MS,
  useRemoveCartLine,
  useUpdateCartLine,
} from '@/features/cart/hooks'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import { cart, cartLine, deferred, result } from './support'

// Plan 2's cart hooks and mini-cart line, the cases their first tests left out (carried into
// Plan 4 Task 1): a failure that is no ApiError, a refused removal, the stepper's bounds, the
// bin during a PUT, a waiting quantity dropped by the bin, and the «added» toast replaced.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

function setup<T>(hook: () => T, cached: Cart) {
  const { client, wrapper } = clientProviders()
  client.setQueryData(CART_KEY, cached)
  return { ...renderHook(hook, { wrapper }), client }
}

function renderLine(line = cartLine()) {
  const { client, wrapper } = clientProviders()
  client.setQueryData(CART_KEY, cart([line]))
  render(
    <ul>
      <MiniCartLine line={line} onNavigate={vi.fn()} />
    </ul>,
    { wrapper },
  )
  return client
}

const methods = () => mocks.bffFetch.mock.calls.map(([, init]) => init?.method ?? 'GET')

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('cart hooks: the failures their tests left out', () => {
  it('a quantity change that fails without an ApiError says the generic sentence', async () => {
    const line = cartLine()
    mocks.bffFetch.mockImplementation((path: string, init?: { method?: string }) =>
      init?.method === 'PUT'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(result(cart([line]))),
    )
    const { result: hook } = setup(() => useUpdateCartLine(line), cart([line]))
    act(() => hook.current.setQuantity(2))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(GENERIC_ERROR_DETAIL), {
      timeout: QUANTITY_DEBOUNCE_MS * 3,
    })
  })

  it('a removal refused for another reason shows the detail, reads the cart again, says false', async () => {
    const detail = 'خطای سرور'
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/'
        ? Promise.resolve(result(cart([cartLine()])))
        : Promise.reject(new ApiError({ status: 500, code: 'error', detail })),
    )
    const { result: hook, client } = setup(() => useRemoveCartLine(), cart([cartLine()]))
    let removed: boolean | undefined
    await act(async () => {
      removed = await hook.current.remove(10001)
    })
    expect(removed).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith(detail)
    expect(client.getQueryState(CART_KEY)?.isInvalidated).toBe(true)
  })

  it('the «added» toast replaces the last one (one id) instead of stacking', () => {
    showAddedToCartToast({ name: 'الف', image: '/a.png' })
    showAddedToCartToast({ name: 'ب', image: '/b.png' })
    const ids = mocks.success.mock.calls.map(([, options]) => options?.id)
    expect(ids).toEqual(['cart-added', 'cart-added'])
  })
})

describe('MiniCartLine: the cases its tests left out', () => {
  it('bounds the stepper by the line’s own limits', () => {
    renderLine(
      cartLine({ quantity: 2, order_limit_min: 2, order_limit_max: 2, available_quantity: 13 }),
    )
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeDisabled()
  })

  it('an unlimited line (order_limit_max 0) stops at what it can hold now', () => {
    renderLine(cartLine({ quantity: 12, order_limit_max: 0, available_quantity: 13 }))
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeEnabled()
  })

  it('locks the bin while the line’s PUT is on its way', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const put = deferred<ReturnType<typeof result>>()
    mocks.bffFetch.mockImplementation(() => put.promise)
    renderLine()
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    await act(() => vi.advanceTimersByTimeAsync(QUANTITY_DEBOUNCE_MS))
    const bin = screen.getByRole('button', { name: 'حذف از سبد خرید' })
    expect(bin).toBeDisabled()
    await act(async () => put.resolve(result(cart([cartLine({ quantity: 2 })]))))
    await waitFor(() => expect(bin).toBeEnabled())
  })

  it('a quantity still waiting is dropped by the bin: one DELETE, no PUT', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.bffFetch.mockResolvedValue(result(cart()))
    renderLine()
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    await user.click(screen.getByRole('button', { name: 'حذف از سبد خرید' }))
    await act(() => vi.advanceTimersByTimeAsync(QUANTITY_DEBOUNCE_MS * 2))
    expect(methods()).toEqual(['DELETE'])
  })
})
