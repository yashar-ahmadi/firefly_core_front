import { focusManager } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CART_KEY,
  cartCount,
  lineLimits,
  QUANTITY_DEBOUNCE_MS,
  useAddToCart,
  useCart,
  useRemoveCartLine,
  useUpdateCartLine,
} from '@/features/cart/hooks'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import { cart, cartLine, deferred, MSG_ADDED, MSG_REMOVED, result } from './support'

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: mocks.dismiss },
}))

const PRODUCT = {
  name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا',
  image: 'http://localhost:8000/static/defaults/default.png',
}

const LIMIT_DETAIL = 'سقف تعداد سفارش برای گوشی موبایل اپل آیفون ۱۶ پرو مکس، ۲ عدد می باشد.'

function limitExceeded() {
  return new ApiError({
    status: 400,
    errors: [{ code: 'cart_item_limit_exceeded', detail: LIMIT_DETAIL, attr: null }],
  })
}

function setup<T>(hook: () => T, cached?: Cart) {
  const { client, wrapper } = clientProviders()
  if (cached) client.setQueryData(CART_KEY, cached)
  return { ...renderHook(hook, { wrapper }), client }
}

/** The bffFetch calls made with `method` (GET when the options have none). */
function callsWith(method: string) {
  return mocks.bffFetch.mock.calls.filter(([, opts]) => (opts?.method ?? 'GET') === method)
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
  mocks.dismiss.mockReset()
})

describe('cartCount', () => {
  it('sums the line quantities, and is 0 without a cart', () => {
    expect(cartCount(undefined)).toBe(0)
    expect(cartCount(cart())).toBe(0)
    expect(
      cartCount(cart([cartLine({ quantity: 2 }), cartLine({ variant_id: 10062, quantity: 3 })])),
    ).toBe(5)
  })
})

describe('lineLimits', () => {
  it('starts at the line minimum and stops at what the line can hold now', () => {
    expect(lineLimits(cartLine({ order_limit_min: 2, available_quantity: 13 }))).toEqual({
      min: 2,
      max: 13,
    })
    expect(lineLimits(cartLine({ order_limit_min: 0, available_quantity: 5 }))).toEqual({
      min: 1,
      max: 5,
    })
    // Nothing left: the stepper must not read 0 as "unlimited".
    expect(lineLimits(cartLine({ available_quantity: 0 }))).toEqual({ min: 1, max: 1 })
  })
})

describe('useCart', () => {
  it('reads cart/ and renders a guest without a cart as an empty cart', async () => {
    mocks.bffFetch.mockResolvedValue(result(cart()))
    const { result: hook } = setup(() => useCart())
    await waitFor(() => expect(hook.current.isSuccess).toBe(true))
    expect(hook.current.data?.is_empty).toBe(true)
    expect(hook.current.isError).toBe(false)
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/', expect.objectContaining({}))
  })

  it('is always stale and reads again when the window regains focus', async () => {
    mocks.bffFetch.mockResolvedValue(result(cart()))
    const { result: hook } = setup(() => useCart())
    await waitFor(() => expect(hook.current.isSuccess).toBe(true))
    expect(hook.current.isStale).toBe(true)
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(2))
    focusManager.setFocused(undefined)
  })
})

describe('useAddToCart', () => {
  it('posts the variant and quantity, stores the returned cart and shows the added toast', async () => {
    const added = cart([cartLine({ quantity: 2 })])
    mocks.bffFetch.mockResolvedValue(result(added, MSG_ADDED))
    const { result: hook, client } = setup(() => useAddToCart(), cart())

    await act(() => hook.current.add(10001, 2, PRODUCT))

    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10001, quantity: 2 },
    })
    expect(client.getQueryData(CART_KEY)).toEqual(added)
    expect(cartCount(client.getQueryData<Cart>(CART_KEY))).toBe(2)
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledTimes(1)

    // The toast: the API's message, the product's image and name, and a link to the cart.
    render(mocks.success.mock.calls[0]?.[0] as ReactNode)
    expect(screen.getByText(MSG_ADDED)).toBeInTheDocument()
    expect(screen.getByText(PRODUCT.name)).toHaveAttribute('dir', 'auto')
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} سبد خرید' })).toHaveAttribute(
      'href',
      '/cart/',
    )
    expect(document.querySelector('img')).toBeInTheDocument()
  })

  it('shows the API detail on cart_item_limit_exceeded, keeps the cache and does not throw', async () => {
    const before = cart([cartLine()])
    mocks.bffFetch.mockRejectedValue(limitExceeded())
    const { result: hook, client } = setup(() => useAddToCart(), before)

    await act(() => expect(hook.current.add(10005, 3, PRODUCT)).resolves.toBeUndefined())

    expect(mocks.error).toHaveBeenCalledWith(LIMIT_DETAIL)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(client.getQueryData(CART_KEY)).toBe(before)
    expect(hook.current.isPending).toBe(false)
  })

  it('sends one POST for a double click', async () => {
    const answer = deferred<ReturnType<typeof result>>()
    mocks.bffFetch.mockReturnValue(answer.promise)
    const { result: hook } = setup(() => useAddToCart())

    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    act(() => {
      first = hook.current.add(10001, 1, PRODUCT)
      second = hook.current.add(10001, 1, PRODUCT)
    })
    await waitFor(() => expect(hook.current.isPending).toBe(true))
    await act(async () => {
      answer.resolve(result(cart([cartLine()]), MSG_ADDED))
      await Promise.all([first, second])
    })
    expect(callsWith('POST')).toHaveLength(1)
    expect(mocks.success).toHaveBeenCalledTimes(1)
  })
})

describe('useUpdateCartLine', () => {
  it('waits for the taps to stop, then sends only the final quantity', async () => {
    const line = cartLine({ quantity: 1 })
    const updated = cart([cartLine({ quantity: 3 })])
    mocks.bffFetch.mockResolvedValue(result(updated))
    const { result: hook, client } = setup(() => useUpdateCartLine(line), cart([line]))

    act(() => hook.current.setQuantity(2))
    act(() => hook.current.setQuantity(3))
    expect(hook.current.quantity).toBe(3)
    expect(hook.current.isPending).toBe(true)
    expect(callsWith('PUT')).toHaveLength(0)

    await waitFor(() => expect(callsWith('PUT')).toHaveLength(1), {
      timeout: QUANTITY_DEBOUNCE_MS * 3,
    })
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/10001/', {
      method: 'PUT',
      body: { quantity: 3 },
    })
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toEqual(updated))
  })

  it('sends nothing when the taps end on the quantity the cart already has', async () => {
    const line = cartLine({ quantity: 2 })
    const { result: hook } = setup(() => useUpdateCartLine(line), cart([line]))

    act(() => hook.current.setQuantity(3))
    act(() => hook.current.setQuantity(2))
    await act(() => new Promise((resolve) => setTimeout(resolve, QUANTITY_DEBOUNCE_MS + 100)))
    expect(callsWith('PUT')).toHaveLength(0)
    expect(hook.current.isPending).toBe(false)
  })

  it('sends a waiting value at once when the line unmounts (the mini-cart closed)', async () => {
    const line = cartLine({ quantity: 1 })
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine({ quantity: 2 })])))
    const { result: hook, unmount, client } = setup(() => useUpdateCartLine(line), cart([line]))

    act(() => hook.current.setQuantity(2))
    unmount()
    // Well before the debounce would have sent it.
    await waitFor(
      () =>
        expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/10001/', {
          method: 'PUT',
          body: { quantity: 2 },
        }),
      { timeout: QUANTITY_DEBOUNCE_MS / 4 },
    )
    await waitFor(() => expect(cartCount(client.getQueryData<Cart>(CART_KEY))).toBe(2))
  })

  it('shows the detail and reads the cart again when the change is refused', async () => {
    const line = cartLine({ quantity: 1 })
    const detail = 'موجودی این کالا تنها ۱۳ عدد است.'
    mocks.bffFetch.mockImplementation((path: string, opts?: { method?: string }) =>
      opts?.method === 'PUT'
        ? Promise.reject(
            new ApiError({
              status: 400,
              errors: [{ code: 'cart_item_insufficient_stock', detail, attr: null }],
            }),
          )
        : Promise.resolve(result(cart([line]))),
    )
    // With a cart observer, as in the mini-cart, so the invalidated cart is read again.
    const { result: hook } = setup(
      () => ({ line: useUpdateCartLine(line), cart: useCart() }),
      cart([line]),
    )
    await waitFor(() => expect(hook.current.cart.isFetching).toBe(false))
    mocks.bffFetch.mockClear()

    act(() => hook.current.line.setQuantity(20))
    expect(hook.current.line.quantity).toBe(20)
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(detail), {
      timeout: QUANTITY_DEBOUNCE_MS * 3,
    })
    await waitFor(() => expect(callsWith('GET')).toHaveLength(1))
    expect(hook.current.line.quantity).toBe(1)
    expect(hook.current.line.isPending).toBe(false)
  })
})

describe('useRemoveCartLine', () => {
  it('deletes the line, stores the returned cart and confirms with the API message', async () => {
    mocks.bffFetch.mockResolvedValue(result(cart(), MSG_REMOVED))
    const { result: hook, client } = setup(() => useRemoveCartLine(), cart([cartLine()]))

    await act(() => hook.current.remove(10001))

    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/10001/remove/', { method: 'DELETE' })
    expect(client.getQueryData<Cart>(CART_KEY)?.is_empty).toBe(true)
    expect(mocks.success).toHaveBeenCalledWith(MSG_REMOVED)
  })

  it('treats a line that is already gone as removed, and reads the cart again', async () => {
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/'
        ? Promise.resolve(result(cart()))
        : Promise.reject(
            new ApiError({
              status: 400,
              errors: [
                {
                  code: 'cart_item_not_found',
                  detail: 'این کالا در سبد خرید شما نیست.',
                  attr: null,
                },
              ],
            }),
          ),
    )
    const { result: hook, client } = setup(() => useRemoveCartLine(), cart([cartLine()]))
    await act(() => hook.current.remove(10001))
    expect(mocks.error).not.toHaveBeenCalled()
    expect(client.getQueryState(CART_KEY)?.isInvalidated).toBe(true)
  })
})
