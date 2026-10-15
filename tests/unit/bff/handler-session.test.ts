// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  bff,
  calls,
  envelope,
  failure,
  isCleared,
  loadHandler,
  refreshCalls,
  setCookies,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

let fetchSpy: FetchSpy

/** Routes the refresh endpoint to `refresh` and everything else to `upstream`. */
function route(refresh: () => Response | Promise<Response>, upstream: () => Response) {
  fetchSpy.mockImplementation(async (input) =>
    String(input).endsWith('account/auth/token/refresh/') ? refresh() : upstream(),
  )
}

const SESSION = ['ff_at', 'ff_rt', 'ff_auth']

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: true }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('refresh before the call', () => {
  it.each([
    ['an expiring', () => jwtExpiringIn(10)],
    ['a missing', () => undefined],
  ])('refreshes %s access token first and uses the new one', async (_label, makeAccess) => {
    const fresh = jwtExpiringIn(900)
    const access = makeAccess()
    route(
      () => envelope({ access: fresh }),
      () => envelope({ uuid: 'u' }),
    )
    const handleBff = await loadHandler()
    const cookies = { ff_rt: jwtExpiringIn(9999), ...(access ? { ff_at: access } : {}) }
    const res = await handleBff(...bff('account/profile/me/', { cookies }))
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    expect(refreshCalls(fetchSpy)[0]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('Authorization')).toBe(`Bearer ${fresh}`)
    expect(setCookies(res).ff_at?.value).toBe(fresh)
    expect(setCookies(res).ff_rt).toBeUndefined()
  })

  it('does not refresh a second time when the refreshed token still gets token_not_valid', async () => {
    route(
      () => envelope({ access: jwtExpiringIn(900) }),
      () => failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/me/', {
        cookies: { ff_at: jwtExpiringIn(5), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
  })

  it('does not refresh a fresh token or a session without a refresh cookie', async () => {
    const handleBff = await loadHandler()
    await handleBff(
      ...bff('cart/', { cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) } }),
    )
    await handleBff(...bff('cart/', { cookies: { ff_at: jwtExpiringIn(5) } }))
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
  })

  it('clears the session and continues as a guest when the refresh token is rejected', async () => {
    route(
      () => failure(401, 'user_inactive'),
      () => envelope({ token: 'guest', items: [] }),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/', { cookies: { ff_at: jwtExpiringIn(5), ff_rt: 'r.r.r', ff_cart: 'guest' } }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.get('X-Cart-Token')).toBe('guest')
    const cookies = setCookies(res)
    for (const name of SESSION) expect(isCleared(cookies[name]), name).toBe(true)
  })

  it('keeps the cookies when the refresh fails for network reasons', async () => {
    route(
      () => Promise.reject(new TypeError('fetch failed')),
      () => envelope({}),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/', { cookies: { ff_at: jwtExpiringIn(5), ff_rt: 'r.r.r' } }),
    )
    expect(res.headers.getSetCookie()).toEqual([])
  })
})

describe('cart token', () => {
  it('is not sent with a bearer, except on cart/merge/', async () => {
    const cookies = { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999), ff_cart: 'guest' }
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/', { cookies }))
    await handleBff(...bff('cart/merge/', { method: 'POST', cookies }))
    const [plain, merge] = upstreamCalls(fetchSpy)
    expect(plain?.headers.has('X-Cart-Token')).toBe(false)
    expect(merge?.headers.get('X-Cart-Token')).toBe('guest')
    expect(merge?.headers.get('Authorization')).toBe(`Bearer ${cookies.ff_at}`)
  })

  it('is deleted after a successful merge and kept after a failed one', async () => {
    const cookies = { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999), ff_cart: 'guest' }
    fetchSpy.mockResolvedValue(envelope({ token: 'user-cart', adjustments: [] }))
    const handleBff = await loadHandler()
    const ok = await handleBff(...bff('cart/merge/', { method: 'POST', cookies }))
    expect(isCleared(setCookies(ok).ff_cart)).toBe(true)
    expect((await ok.json()).data).toEqual({ adjustments: [] })

    fetchSpy.mockResolvedValue(failure(401, 'cart_token_required'))
    const failed = await handleBff(...bff('cart/merge/', { method: 'POST', cookies }))
    expect(setCookies(failed).ff_cart).toBeUndefined()
  })

  it('is never taken from a signed-in cart response', async () => {
    fetchSpy.mockResolvedValue(envelope({ token: 'user-cart' }))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/item/add/', {
        method: 'POST',
        json: {},
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    expect(setCookies(res).ff_cart).toBeUndefined()
    expect((await res.json()).data).toEqual({})
  })

  it.each([
    ['an empty token on a guest read', () => envelope({ token: '', is_empty: true })],
    ['cart_not_found on a guest write', () => failure(404, 'cart_not_found')],
  ])('is dropped on %s', async (_label, response) => {
    fetchSpy.mockImplementation(async () => response())
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/', { cookies: { ff_cart: 'dead' } }))
    expect(isCleared(setCookies(res).ff_cart)).toBe(true)
  })

  it('is only captured from cart/* responses', async () => {
    fetchSpy.mockResolvedValue(envelope({ token: 'not-a-cart' }))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('product/x/'))
    expect(setCookies(res).ff_cart).toBeUndefined()
    expect((await res.json()).data).toEqual({ token: 'not-a-cart' })
  })
})

describe('session end and replacement', () => {
  it.each(['user_inactive', 'user_not_found'])('clears the session on %s', async (code) => {
    fetchSpy.mockResolvedValue(failure(401, code))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/me/', {
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    for (const name of SESSION) expect(isCleared(setCookies(res)[name]), name).toBe(true)
  })

  it('clears the session after logout-all, even if the API fails', async () => {
    fetchSpy.mockResolvedValue(failure(401, 'not_authenticated'))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/logout-all/', {
        method: 'POST',
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    for (const name of SESSION) expect(isCleared(setCookies(res)[name]), name).toBe(true)
  })

  it('replaces the pair returned by a password change', async () => {
    const access = jwtExpiringIn(900)
    const refresh = jwtExpiringIn(604_800)
    fetchSpy.mockResolvedValue(envelope({ tokens: { access, refresh } }))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/password/change/', {
        method: 'POST',
        json: { password: 'x' },
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    const cookies = setCookies(res)
    expect(cookies.ff_at?.value).toBe(access)
    expect(cookies.ff_rt?.value).toBe(refresh)
    expect((await res.json()).data).toEqual({})
  })
})

describe('account/auth/token/refresh/ through the BFF', () => {
  it('uses the refresh cookie, stores the access token and keeps it out of the body', async () => {
    const refresh = jwtExpiringIn(9999)
    const fresh = jwtExpiringIn(900)
    fetchSpy.mockResolvedValue(envelope({ access: fresh }))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/token/refresh/', {
        method: 'POST',
        json: { refresh: 'attacker.supplied.token' },
        cookies: { ff_rt: refresh },
      }),
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [call] = calls(fetchSpy)
    expect(JSON.parse(String(call?.init.body))).toEqual({ refresh })
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(setCookies(res).ff_at?.value).toBe(fresh)
    const text = await res.text()
    expect(text).not.toContain(fresh)
    expect(JSON.parse(text).data).toEqual({})
  })

  it('clears the session when the refresh token is rejected', async () => {
    fetchSpy.mockResolvedValue(failure(401, 'auth_token_invalid'))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/token/refresh/', { method: 'POST', cookies: { ff_rt: 'r.r.r' } }),
    )
    for (const name of SESSION) expect(isCleared(setCookies(res)[name]), name).toBe(true)
  })
})
