import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCart } from '@/features/cart/hooks'
import { ApiError } from '@/lib/api/errors'
import { clearViewerQueries, isSessionExpiredError } from '@/lib/session/viewer-queries'
import { cart, cartLine, result } from '../cart/support'
import { clientProviders } from '../support/providers'
import { seed, VIEWER_KEYS } from './seed'

// What a login, a logout and a session's end drop (every key of the visitor's own data), and
// which 401s mean the session is gone.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('clearViewerQueries', () => {
  it("drops the previous viewer's queries and keeps the ones that are the same for everyone", async () => {
    const { client } = clientProviders()
    seed(client)
    await clearViewerQueries(client)
    for (const key of VIEWER_KEYS) {
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
