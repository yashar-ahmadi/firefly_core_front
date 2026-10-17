import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMe } from '@/features/auth/use-me'
import { useCart } from '@/features/cart/hooks'
import { useWishlistIds } from '@/features/wishlist/hooks'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { clearViewerQueries, isSessionExpiredError, ME_KEY } from '@/lib/session/viewer-queries'
import { cart, cartLine, result } from '../cart/support'
import { clientProviders } from '../support/providers'

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

/** A cache as a signed-in visitor leaves it: theirs, and data that is the same for everyone. */
function seed(client: ReturnType<typeof clientProviders>['client']) {
  client.setQueryData(ME_KEY, { full_name: 'سارا احمدی' })
  client.setQueryData(['summary'], { wishlist_count: 3 })
  client.setQueryData(['wishlist', 'ids'], [10001, 10062])
  client.setQueryData(['addresses'], { count: 1, results: [{ id: 10001, title: 'خانه' }] })
  client.setQueryData(['geo', 'provinces'], [{ id: 8, name: 'تهران' }])
  client.setQueryData(['cart'], cart([cartLine({ quantity: 2 })]))
  // The BFF's product payload carries `is_in_wishlist`; its comment lists `is_current_user`.
  client.setQueryData(['product', 'samsung-galaxy-s25-ultra'], { is_in_wishlist: true })
  client.setQueryData(['product', 'samsung-galaxy-s25-ultra', 'comments', 'review'], {
    pages: [{ results: [{ id: 1, is_current_user: true }] }],
    pageParams: [1],
  })
  client.setQueryData(['search-suggest', 'گوشی'], { products: [] })
}

describe('clearViewerQueries', () => {
  it("drops the previous viewer's queries and keeps the ones that are the same for everyone", async () => {
    const { client } = clientProviders()
    seed(client)
    await clearViewerQueries(client)
    for (const key of [
      ME_KEY,
      ['summary'],
      ['wishlist', 'ids'],
      ['addresses'],
      ['cart'],
      ['product', 'samsung-galaxy-s25-ultra'],
      ['product', 'samsung-galaxy-s25-ultra', 'comments', 'review'],
    ]) {
      expect(client.getQueryData(key), JSON.stringify(key)).toBeUndefined()
    }
    expect(client.getQueryData(['search-suggest', 'گوشی'])).toEqual({ products: [] })
    expect(client.getQueryData(['geo', 'provinces'])).toEqual([{ id: 8, name: 'تهران' }])
  })

  it('reads a query on screen again, for the new viewer, without showing the old data', async () => {
    const { client, wrapper } = clientProviders()
    seed(client)
    const guestCart = cart()
    let answer: (value: unknown) => void = () => {}
    mocks.bffFetch.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { result: hook } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
    await act(async () => answer(result(cart([cartLine({ quantity: 2 })]))))
    expect(hook.current.data?.item_count).toBe(2)

    let cleared: Promise<void> = Promise.resolve()
    act(() => {
      cleared = clearViewerQueries(client)
    })
    // The old viewer's cart leaves the screen while the new read is on its way.
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hook.current.data).toBeUndefined())
    await act(async () => {
      answer(result(guestCart))
      await cleared
    })
    await waitFor(() => expect(hook.current.data?.item_count).toBe(0))
    expect(mocks.bffFetch).toHaveBeenCalledTimes(2)
  })
})

describe('isSessionExpiredError', () => {
  it.each([
    'not_authenticated',
    'token_not_valid',
    'authentication_failed',
    'user_not_found',
    'user_inactive',
  ])('is true for a 401 %s: the session is gone', (code) => {
    expect(isSessionExpiredError(new ApiError({ status: 401, code }))).toBe(true)
  })

  it.each([
    // Configuration problems: logging in again cannot help.
    ['a missing API key', new ApiError({ status: 401, code: 'api_key_missing' })],
    ['a bad API key', new ApiError({ status: 401, code: 'api_key_invalid' })],
    ['a malformed bearer', new ApiError({ status: 401, code: 'bad_authorization_header' })],
    // Answers of the sign-in forms themselves.
    ['a wrong password', new ApiError({ status: 401, code: 'auth_invalid_credentials' })],
    ['a bad Google token', new ApiError({ status: 401, code: 'auth_google_token_invalid' })],
    ['a 403', new ApiError({ status: 403, code: 'permission_denied' })],
    ['a 500', new ApiError({ status: 500, code: 'server_error' })],
    ['a lost connection', ApiError.network()],
    ['any other error', new Error('401')],
    ['nothing', undefined],
  ])('is false for %s', (_label, error) => {
    expect(isSessionExpiredError(error)).toBe(false)
  })
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
