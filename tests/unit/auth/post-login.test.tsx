import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompleteLogin } from '@/features/auth/components/post-login'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { cart, cartLine, result } from '../cart/support'
import { clientProviders } from '../support/providers'
import { SARA } from './fixtures'

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    bffFetch: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    info: vi.fn(),
  }
})
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: mocks.info, success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const SIGNED_IN = { user: SARA, requires_totp: false, remember_me: true }

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A guest's cache, and the hook with the session flag beside it. */
function renderComplete() {
  const providers = clientProviders({ hasSession: false })
  const { client } = providers
  client.setQueryData(['wishlist', 'ids'], [10001])
  client.setQueryData(['summary'], { wishlist_count: 1 })
  client.setQueryData(['product', 'samsung-galaxy-s25-ultra'], { is_in_wishlist: false })
  client.setQueryData(['search-suggest', 'گوشی'], { products: [] })
  const hook = renderHook(() => ({ complete: useCompleteLogin(), session: useSession() }), {
    wrapper: providers.wrapper,
  })
  return { ...hook, client }
}

describe('completeLogin', () => {
  it('merges the guest cart once, renews the viewer queries and goes to next', async () => {
    const merged = cart([cartLine({ quantity: 2 })])
    mocks.bffFetch.mockResolvedValue(result(merged))
    // A guest's checkout receiver kept in the tab (Plan 4 Task 2): the guest's, not the account's.
    sessionStorage.setItem('ff-checkout-receiver', '{"values":{},"confirmed":true}')
    const { result: hook, client } = renderComplete()
    await act(() => hook.current.complete(SIGNED_IN, '/cart/'))
    expect(sessionStorage.getItem('ff-checkout-receiver')).toBeNull()

    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/merge/', { method: 'POST' })
    expect(hook.current.session.hasSession).toBe(true)
    // The guest's viewer data is gone; the merged cart and the new profile are in.
    expect(client.getQueryData(['wishlist', 'ids'])).toBeUndefined()
    expect(client.getQueryData(['product', 'samsung-galaxy-s25-ultra'])).toBeUndefined()
    expect(client.getQueryData(['search-suggest', 'گوشی'])).toEqual({ products: [] })
    expect(client.getQueryData(['cart'])).toEqual(merged)
    expect(client.getQueryData(ME_KEY)).toEqual(SARA)
    // …and read again where they are shown.
    expect(client.getQueryState(['cart'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(ME_KEY)?.isInvalidated).toBe(true)
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/cart/')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '/login/', ''])(
    'lands on /account/ for next %j',
    async (next) => {
      mocks.bffFetch.mockResolvedValue(result(cart()))
      const { result: hook } = renderComplete()
      await act(() => hook.current.complete(SIGNED_IN, next))
      expect(mocks.replace).toHaveBeenCalledWith('/account/')
    },
  )

  it('tells what the merge changed in one toast, in Persian', async () => {
    const merged = {
      ...cart([cartLine({ quantity: 2 })]),
      adjustments: [
        {
          variant_id: 10005,
          product_name: 'گوشی موبایل اپل آیفون ۱۶ پرو مکس',
          requested: 3,
          applied: 2,
          was_dropped: false,
        },
        {
          variant_id: 10062,
          product_name: 'هدفون سونی',
          requested: 1,
          applied: 0,
          was_dropped: true,
        },
      ],
    }
    mocks.bffFetch.mockResolvedValue(result(merged))
    const { result: hook } = renderComplete()
    await act(() => hook.current.complete(SIGNED_IN, ''))
    expect(mocks.info).toHaveBeenCalledTimes(1)
    const [title, options] = mocks.info.mock.calls[0]!
    expect(title).toBe('سبد خرید شما به‌روز شد')
    expect(options.description).toContain(
      'تعداد «گوشی موبایل اپل آیفون ۱۶ پرو مکس» از ۳ به ۲ کاهش یافت.',
    )
    expect(options.description).toContain('«هدفون سونی» دیگر قابل سفارش نیست و از سبد حذف شد.')
    expect(mocks.replace).toHaveBeenCalledWith('/account/')
  })

  it('logs a failed merge, says so softly and still completes the login', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.bffFetch.mockRejectedValue(ApiError.network())
    const { result: hook, client } = renderComplete()
    await act(() => hook.current.complete(SIGNED_IN, '/product/samsung-galaxy-s25-ultra/'))
    expect(warn).toHaveBeenCalledWith('[login] cart merge failed:', 0, 'network_error')
    expect(mocks.info).toHaveBeenCalledTimes(1)
    expect(mocks.info.mock.calls[0]![0]).toMatch(/سبد خرید/)
    expect(hook.current.session.hasSession).toBe(true)
    expect(client.getQueryData(['wishlist', 'ids'])).toBeUndefined()
    expect(client.getQueryState(['cart'])).toBeUndefined()
    expect(mocks.replace).toHaveBeenCalledWith('/product/samsung-galaxy-s25-ultra/')
  })
})
