import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onBeforeLogout } from '@/features/auth/logout-hooks'
import { useLogout } from '@/features/auth/use-logout'
import { useCart } from '@/features/cart/hooks'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { cart, cartLine, result } from '../cart/support'
import { clientProviders } from '../support/providers'
import { SARA } from './fixtures'

// Logout (auth digest §4.10–4.11, F6): the pre-logout steps, then the API; whatever it answers,
// this tab forgets the visitor, goes home and says so.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    logout: vi.fn(),
    logoutAll: vi.fn(),
    bffFetch: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: { logout: mocks.logout, logoutAll: mocks.logoutAll },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

const COMMENTS_KEY = ['product', 'samsung-galaxy-s25-ultra', 'comments', 'review']
const unregister: (() => void)[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.logout.mockResolvedValue({})
  mocks.logoutAll.mockResolvedValue({})
  mocks.bffFetch.mockResolvedValue(result(cart()))
})

afterEach(() => {
  for (const off of unregister.splice(0)) off()
})

function hook(register?: Parameters<typeof onBeforeLogout>[0]) {
  if (register) unregister.push(onBeforeLogout(register))
  const providers = clientProviders({ hasSession: true })
  const { client } = providers
  // What the signed-in visitor left in the cache: theirs, and data that is the same for everyone.
  client.setQueryData(ME_KEY, SARA)
  client.setQueryData(['summary'], { wishlist_count: 3 })
  client.setQueryData(['wishlist', 'ids'], [10001])
  client.setQueryData(COMMENTS_KEY, {
    pages: [{ results: [{ id: 1, is_current_user: true }] }],
    pageParams: [1],
  })
  client.setQueryData(['search-suggest', 'گوشی'], { products: [] })
  // A guest's checkout receiver kept in the tab before this login (Plan 4 Task 2).
  sessionStorage.setItem('ff-checkout-receiver', '{"values":{},"confirmed":false}')
  const rendered = renderHook(() => ({ ...useLogout(), session: useSession() }), {
    wrapper: providers.wrapper,
  })
  return { ...rendered, client }
}

/** The local state of a signed-out tab: no session, nothing of the visitor, home, a toast. */
function expectSignedOut({ result: current, client }: ReturnType<typeof hook>) {
  expect(current.current.session.hasSession).toBe(false)
  // The hearts' ids, and the comment lists' «شما» marks (`is_current_user`), among them.
  for (const key of [ME_KEY, ['summary'], ['wishlist', 'ids'], COMMENTS_KEY]) {
    expect(client.getQueryData(key), JSON.stringify(key)).toBeUndefined()
  }
  // Nothing on screen reads it: the rest of the cache goes too.
  expect(client.getQueryData(['search-suggest', 'گوشی'])).toBeUndefined()
  expect(sessionStorage.getItem('ff-checkout-receiver')).toBeNull()
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
  expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith('از حساب خارج شدید')
}

describe('useLogout', () => {
  it('logs this device out, then clears the visitor, goes home and says so', async () => {
    const rendered = hook()
    await act(() => rendered.result.current.logout())
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.logoutAll).not.toHaveBeenCalled()
    expectSignedOut(rendered)
  })

  it('{ all: true } logs every device out', async () => {
    const rendered = hook()
    await act(() => rendered.result.current.logout({ all: true }))
    expect(mocks.logoutAll).toHaveBeenCalledTimes(1)
    expect(mocks.logout).not.toHaveBeenCalled()
    expectSignedOut(rendered)
  })

  // The BFF was reached: it has dropped the session cookies, whatever the API answered (a lost
  // connection before the BFF: use-logout-offline.test.tsx).
  it.each([
    ['the API out of reach', new ApiError({ status: 502, code: 'network_error' })],
    ['a rejected token', new ApiError({ status: 400, code: 'auth_token_invalid' })],
  ])('still signs this tab out after %s', async (_, error) => {
    mocks.logout.mockRejectedValue(error)
    const rendered = hook()
    await act(() => rendered.result.current.logout())
    expectSignedOut(rendered)
  })

  it('a cart on screen is read again as a guest’s, without a reload', async () => {
    const providers = clientProviders({ hasSession: true })
    mocks.bffFetch.mockResolvedValueOnce(result(cart([cartLine({ quantity: 2 })])))
    const { result: current } = renderHook(() => ({ cart: useCart(), ...useLogout() }), {
      wrapper: providers.wrapper,
    })
    await waitFor(() => expect(current.current.cart.data?.item_count).toBe(2))
    await act(() => current.current.logout())
    await waitFor(() => expect(current.current.cart.data?.item_count).toBe(0))
    expect(mocks.bffFetch).toHaveBeenCalledTimes(2)
  })

  it('runs the pre-logout steps first, while the session is still there', async () => {
    const order: string[] = []
    const step = vi.fn(async ({ all }: { all: boolean }) => {
      order.push(`step all=${all}`)
    })
    mocks.logout.mockImplementation(async () => order.push('logout'))
    const rendered = hook(step)
    await act(() => rendered.result.current.logout())
    expect(order).toEqual(['step all=false', 'logout'])
  })

  it('a failing or hanging pre-logout step never holds the logout back', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      unregister.push(onBeforeLogout(() => new Promise<void>(() => {})))
      const rendered = hook(() => {
        throw new Error('push unregister failed')
      })
      let done = false
      act(() => {
        void rendered.result.current.logout().then(() => (done = true))
      })
      await act(() => vi.advanceTimersByTimeAsync(2_999))
      expect(mocks.logout).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(mocks.logout).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(done).toBe(true))
      expectSignedOut(rendered)
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })

  it('is safe to press twice: one request, one navigation, one toast', async () => {
    let answer: () => void = () => {}
    mocks.logout.mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)))
    const rendered = hook()
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = rendered.result.current.logout()
      second = rendered.result.current.logout()
    })
    expect(second).toBe(first)
    await waitFor(() => expect(rendered.result.current.pending).toBe(true))
    await act(async () => {
      answer()
      await first
    })
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(rendered.result.current.pending).toBe(false)
    expectSignedOut(rendered)
  })

  it('two places offering «خروج» share one logout: one request, one navigation, one toast', async () => {
    let answer: () => void = () => {}
    mocks.logout.mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)))
    const providers = clientProviders({ hasSession: true })
    const { result: current } = renderHook(() => ({ menu: useLogout(), panel: useLogout() }), {
      wrapper: providers.wrapper,
    })
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = current.current.menu.logout()
      second = current.current.panel.logout()
    })
    expect(second).toBe(first)
    await waitFor(() => expect(current.current.panel.pending).toBe(true))
    expect(current.current.menu.pending).toBe(true)
    await act(async () => {
      answer()
      await first
    })
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.notify.success).toHaveBeenCalledTimes(1)
    expect(current.current.panel.pending).toBe(false)
  })

  it('an unregistered pre-logout step is not run', async () => {
    const step = vi.fn()
    const off = onBeforeLogout(step)
    off()
    const rendered = hook()
    await act(() => rendered.result.current.logout())
    expect(step).not.toHaveBeenCalled()
  })
})
