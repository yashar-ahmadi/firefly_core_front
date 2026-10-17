import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  toggleWishlistOnce,
  useToggleWishlist,
  useWishlistIds,
  WISHLIST_IDS_KEY,
} from '@/features/wishlist/hooks'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  push: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const LIST = 'product/wishlist/list/'

/** One page of `GET product/wishlist/list/` as bffFetch resolves it. */
function page(ids: number[], next: string | null = null) {
  return {
    data: {
      count: ids.length,
      total_pages: 1,
      current_page: 1,
      page_size: 100,
      next,
      previous: null,
      results: ids.map((id) => ({ id, slug: `product-${id}`, is_in_wishlist: true })),
    },
    msg: 'درخواست با موفقیت انجام شد.',
    status: 200,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderWishlist(hasSession = true) {
  const providers = clientProviders({ hasSession })
  const hook = renderHook(() => ({ wishlist: useWishlistIds(), toggle: useToggleWishlist() }), {
    wrapper: providers.wrapper,
  })
  return { ...hook, client: providers.client }
}

/** Answers list reads with `ids` and hands every write to `write`. */
function routeCalls(ids: number[], write: (path: string, method: string) => Promise<unknown>) {
  mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) =>
    path === LIST ? Promise.resolve(page(ids)) : write(path, opts.method ?? 'GET'),
  )
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useWishlistIds', () => {
  it('reads every page of the wishlist, 100 at a time', async () => {
    mocks.bffFetch
      .mockResolvedValueOnce(page([1, 2], 'http://api/v1/product/wishlist/list/?page=2'))
      .mockResolvedValueOnce(page([3]))
    const { result } = renderWishlist()
    await waitFor(() => expect(result.current.wishlist.isLoading).toBe(false))
    expect([...result.current.wishlist.ids]).toEqual([1, 2, 3])
    expect(mocks.bffFetch).toHaveBeenCalledTimes(2)
    expect(mocks.bffFetch.mock.calls.map(([path, opts]) => [path, opts.query])).toEqual([
      [LIST, { limit: 100, page: 1 }],
      [LIST, { limit: 100, page: 2 }],
    ])
  })

  it('makes no request without a session', () => {
    const { result } = renderWishlist(false)
    expect(result.current.wishlist.ids.size).toBe(0)
    expect(result.current.wishlist.isLoading).toBe(false)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('treats an expired session (401) as an empty wishlist', async () => {
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 401, code: 'not_authenticated', detail: 'وارد شوید' }),
    )
    const { result } = renderWishlist()
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalled())
    await waitFor(() => expect(result.current.wishlist.isLoading).toBe(false))
    expect(result.current.wishlist.ids.size).toBe(0)
  })
})

describe('useToggleWishlist', () => {
  it('adds optimistically, then keeps the id once the API saves it', async () => {
    const post = deferred<unknown>()
    routeCalls([1], () => post.promise)
    const { result } = renderWishlist()
    await waitFor(() => expect(result.current.wishlist.ids.has(1)).toBe(true))

    act(() => result.current.toggle.toggle({ id: 2, slug: 'product-2' }))
    await waitFor(() => expect(result.current.wishlist.ids.has(2)).toBe(true))
    expect(mocks.bffFetch).toHaveBeenCalledWith('product/detail/product-2/wishlist/', {
      method: 'POST',
    })

    routeCalls([1, 2], () => Promise.reject(new Error('unexpected')))
    await act(async () =>
      post.resolve({ data: { is_in_wishlist: true }, msg: 'ذخیره شد', status: 201 }),
    )
    await waitFor(() => expect(result.current.toggle.isPending).toBe(false))
    expect(result.current.wishlist.ids.has(2)).toBe(true)
    expect(mocks.success).toHaveBeenCalledWith('ذخیره شد')
  })

  it('removes with DELETE', async () => {
    routeCalls([1, 2], () => Promise.resolve({ data: null, msg: '', status: 204 }))
    const { result } = renderWishlist()
    await waitFor(() => expect(result.current.wishlist.ids.has(2)).toBe(true))
    routeCalls([1], () => Promise.resolve({ data: null, msg: '', status: 204 }))
    act(() => result.current.toggle.toggle({ id: 2, slug: 'product-2' }))
    await waitFor(() => expect(result.current.wishlist.ids.has(2)).toBe(false))
    expect(mocks.bffFetch).toHaveBeenCalledWith('product/detail/product-2/wishlist/', {
      method: 'DELETE',
    })
  })

  it('reverts the optimistic change and shows the error when the mutation rejects', async () => {
    const post = deferred<unknown>()
    routeCalls([1], () => post.promise)
    const { result, client } = renderWishlist()
    await waitFor(() => expect(result.current.wishlist.ids.has(1)).toBe(true))

    act(() => result.current.toggle.toggle({ id: 2, slug: 'product-2' }))
    await waitFor(() => expect(result.current.wishlist.ids.has(2)).toBe(true))

    // From here reads never answer, so only the revert itself can drop the id.
    mocks.bffFetch.mockImplementation((path: string) =>
      path === LIST ? new Promise(() => {}) : post.promise,
    )
    await act(async () =>
      post.reject(new ApiError({ status: 429, code: 'throttled', detail: 'کمی صبر کنید.' })),
    )
    await waitFor(() => expect(result.current.wishlist.ids.has(2)).toBe(false))
    expect([...result.current.wishlist.ids]).toEqual([1])
    expect(client.getQueryData(WISHLIST_IDS_KEY)).toEqual([1])
    expect(mocks.error).toHaveBeenCalledWith('کمی صبر کنید.')
  })

  it('sends a guest to login with the current page and query as next', () => {
    window.history.replaceState(null, '', '/product/list/?brand=apple')
    const { result } = renderWishlist(false)
    act(() => result.current.toggle.toggle({ id: 2, slug: 'product-2' }))
    expect(mocks.push).toHaveBeenCalledWith('/login/?next=/product/list/%3Fbrand%3Dapple')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('sends the visitor to login when the API says the session is gone', async () => {
    routeCalls([], () =>
      Promise.reject(new ApiError({ status: 401, code: 'not_authenticated', detail: 'x' })),
    )
    window.history.replaceState(null, '', '/brand/samsung/')
    const { result } = renderWishlist()
    await waitFor(() => expect(result.current.wishlist.isLoading).toBe(false))
    act(() => result.current.toggle.toggle({ id: 2, slug: 'product-2' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login/?next=/brand/samsung/'))
    expect(result.current.wishlist.ids.has(2)).toBe(false)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})

describe('toggleWishlistOnce', () => {
  it('leaves no mutation in the cache once it settled and gcTime passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { client } = clientProviders({ hasSession: true })
      routeCalls([], () =>
        Promise.resolve({ data: { is_in_wishlist: true }, msg: '', status: 201 }),
      )
      const router = { push: mocks.push }
      await toggleWishlistOnce(client, router, true, { id: 2, slug: 'product-2' })
      routeCalls([2], () => Promise.reject(new ApiError({ status: 429, code: 'throttled' })))
      await toggleWishlistOnce(client, router, true, { id: 3, slug: 'product-3' })
      const cache = client.getMutationCache()
      const gcTime = cache.getAll()[0]?.gcTime ?? 0
      expect(gcTime).toBeGreaterThan(0)
      await vi.advanceTimersByTimeAsync(gcTime + 1)
      expect(cache.getAll()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
