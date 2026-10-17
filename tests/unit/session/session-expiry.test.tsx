import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMe } from '@/features/auth/use-me'
import { useCart } from '@/features/cart/hooks'
import { useWishlistIds } from '@/features/wishlist/hooks'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { cart, result } from '../cart/support'
import { clientProviders } from '../support/providers'
import { seed } from './seed'

const mocks = vi.hoisted(() => {
  const push = vi.fn()
  const replace = vi.fn()
  // One router object, as Next's useRouter() memoises it.
  return { bffFetch: vi.fn(), push, replace, router: { push, replace } }
})
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useSessionExpired', () => {
  function renderExpiry() {
    const providers = clientProviders({ hasSession: true })
    seed(providers.client)
    const hook = renderHook(() => ({ expire: useSessionExpired(), session: useSession() }), {
      wrapper: providers.wrapper,
    })
    return { ...hook, client: providers.client }
  }

  it('ends the session: no session, no viewer data, and the profile known to be nobody', () => {
    window.history.replaceState(null, '', '/brand/samsung/')
    const { result, client } = renderExpiry()
    act(() => result.current.expire())
    expect(result.current.session.hasSession).toBe(false)
    expect(client.getQueryData(['wishlist', 'ids'])).toBeUndefined()
    expect(client.getQueryData(['summary'])).toBeUndefined()
    expect(client.getQueryData(ME_KEY)).toBeNull()
    // A public page stays: it turns into its guest version.
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('after an action of the visitor, goes to login with the page and its query as next', () => {
    window.history.replaceState(null, '', '/product/list/?brand=apple')
    const { result } = renderExpiry()
    act(() => result.current.expire({ toLogin: true }))
    expect(mocks.push).toHaveBeenCalledWith('/login/?next=/product/list/%3Fbrand%3Dapple')
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('on a page that needs a session, replaces it with login (Back does not return to it)', () => {
    window.history.replaceState(null, '', '/account/')
    const { result } = renderExpiry()
    act(() => result.current.expire())
    expect(mocks.replace).toHaveBeenCalledWith('/login/?next=/account/')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('is the same function across renders', () => {
    const { result, rerender } = renderExpiry()
    const first = result.current.expire
    rerender()
    expect(result.current.expire).toBe(first)
  })

  it('ends the session once when two session queries fail together on an account page', async () => {
    window.history.replaceState(null, '', '/account/')
    const providers = clientProviders({ hasSession: true })
    const gone = new ApiError({ status: 401, code: 'token_not_valid' })
    const failures: Array<() => void> = []
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(result(cart()))
      // The profile and the wishlist ids: both answer 401 at the same moment, below.
      return new Promise((_resolve, reject) => failures.push(() => reject(gone)))
    })
    const cartReads = () => mocks.bffFetch.mock.calls.filter(([path]) => path === 'cart/').length
    const { result: hook } = renderHook(
      () => ({ me: useMe(), ids: useWishlistIds(), cart: useCart(), session: useSession() }),
      { wrapper: providers.wrapper },
    )
    await waitFor(() => expect(failures).toHaveLength(2))
    await waitFor(() => expect(hook.current.cart.data).toBeDefined())
    expect(cartReads()).toBe(1)

    await act(async () => {
      for (const fail of failures) fail()
    })
    await waitFor(() => expect(hook.current.session.hasSession).toBe(false))
    await waitFor(() => expect(cartReads()).toBe(2))
    // Let any second (duplicate) run show itself before counting.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login/?next=/account/')
    expect(cartReads()).toBe(2)
    expect(hook.current.me.data).toBeNull()
  })

  it('after the session ended, an action that needs it still goes to login', () => {
    window.history.replaceState(null, '', '/brand/samsung/')
    const { result } = renderExpiry()
    act(() => result.current.expire())
    act(() => result.current.expire({ toLogin: true }))
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith('/login/?next=/brand/samsung/')
  })

  it('on an account page, an action still goes to login when the page thought it was a guest', () => {
    // ff_rt let the account layout in, but ff_auth was gone: hasSession started false.
    window.history.replaceState(null, '', '/account/wishlist/')
    const providers = clientProviders({ hasSession: false })
    const { result } = renderHook(() => useSessionExpired(), { wrapper: providers.wrapper })
    // A background read has nothing to end: no navigation.
    act(() => result.current())
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => result.current({ toLogin: true }))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login/?next=/account/wishlist/')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('works again for a session that starts after the last one ended', () => {
    window.history.replaceState(null, '', '/account/')
    const { result } = renderExpiry()
    act(() => result.current.expire())
    act(() => result.current.session.setHasSession(true))
    act(() => result.current.expire())
    expect(mocks.replace).toHaveBeenCalledTimes(2)
  })
})
