import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCart } from '@/features/cart/hooks'
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
      ['cart'],
      ['product', 'samsung-galaxy-s25-ultra'],
      ['product', 'samsung-galaxy-s25-ultra', 'comments', 'review'],
    ]) {
      expect(client.getQueryData(key), JSON.stringify(key)).toBeUndefined()
    }
    expect(client.getQueryData(['search-suggest', 'گوشی'])).toEqual({ products: [] })
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
})
