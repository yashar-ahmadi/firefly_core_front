// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  bff,
  envelope,
  failure,
  loadHandler,
  refreshCalls,
  setCookies,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

// The sign-in and recovery forms' POSTs (login, OTP login, Google, registration, password reset)
// authenticate with the API key alone: they start a session, they never need one. A stale refresh
// cookie left in the browser must not stand in their way: no refresh step before them (whose
// transient failure would answer 503 and block every sign-in until it heals), no bearer, no
// refresh after their 401 (a wrong password is not a stale token). No guest cart token either:
// the cart joins the account once, through `cart/merge/` after the login (`isKeyOnly`).

const AUTH_ENTRIES = [
  'account/auth/login/',
  'account/auth/login/otp/request/',
  'account/auth/login/otp/verify/',
  'account/auth/google/',
  'account/auth/register/start/',
  'account/auth/register/verify/',
  'account/auth/register/resend-otp/',
  'account/auth/register/complete/',
  'account/auth/password-reset/request/',
  'account/auth/password-reset/verify-otp/',
  'account/auth/password-reset/confirm/',
]

/**
 * A refresh cookie the API would refuse to refresh just now; the access cookie is gone. A guest
 * cart is still in the browser.
 */
const STALE = { ff_rt: jwtExpiringIn(9999), ff_auth: '1', ff_cart: 'guest' }

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

/** The refresh fails transiently (a 503); anything else answers `upstream()`. */
function route(upstream: () => Response) {
  fetchSpy.mockImplementation(async (input) =>
    String(input).endsWith('account/auth/token/refresh/')
      ? failure(503, 'service_unavailable')
      : upstream(),
  )
}

describe('the auth forms’ POSTs with a stale refresh cookie and the refresh unavailable', () => {
  it.each(AUTH_ENTRIES)(
    '%s goes out with the key alone: no refresh, no bearer, no cart token',
    async (path) => {
      route(() => envelope({ ok: true }))
      const handleBff = await loadHandler()
      const res = await handleBff(...bff(path, { method: 'POST', json: {}, cookies: STALE }))
      expect(res.status).toBe(200)
      expect(refreshCalls(fetchSpy)).toEqual([])
      const [call] = upstreamCalls(fetchSpy)
      expect(call?.headers.get('X-API-Key')).toBe('key-123')
      expect(call?.headers.has('Authorization')).toBe(false)
      expect(call?.headers.has('X-Cart-Token')).toBe(false)
    },
  )

  it('a login’s new pair is kept as the session (cookies set), the stale one replaced', async () => {
    const access = jwtExpiringIn(900)
    const refresh = jwtExpiringIn(86_400)
    route(() => envelope({ user: { id: 1 }, requires_totp: false, tokens: { access, refresh } }))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/login/', { method: 'POST', json: {}, cookies: STALE }),
    )
    expect(res.status).toBe(200)
    expect(upstreamCalls(fetchSpy)[0]?.headers.has('X-Cart-Token')).toBe(false)
    const cookies = setCookies(res)
    expect(cookies.ff_at?.value).toBe(access)
    expect(cookies.ff_rt?.value).toBe(refresh)
    expect(JSON.stringify(await res.json())).not.toContain(refresh)
  })

  it('a wrong password’s 401 is the form’s answer: relayed, no refresh, the cookies untouched', async () => {
    route(() => failure(401, 'auth_invalid_credentials'))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/login/', {
        method: 'POST',
        json: {},
        cookies: { ...STALE, ff_at: jwtExpiringIn(600) },
      }),
    )
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toEqual([])
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('any other session call still waits for the refresh: a retryable 503', async () => {
    route(() => envelope({ ok: true }))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('account/profile/me/', { cookies: STALE }))
    expect(res.status).toBe(503)
    expect(upstreamCalls(fetchSpy)).toEqual([])
  })
})
