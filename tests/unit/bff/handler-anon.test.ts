// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  API,
  bff,
  envelope,
  failure,
  loadHandler,
  refreshCalls,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

// A payment's status read without the session (order digest §3.2.5, §11 #7): signed in, the API
// refuses another account's payment (403 `payment_forbidden`) and answers the same read made
// anonymously, so the result page retries it with `?anon=1`. Only for `GET payment/<uuid>/status/`:
// no Authorization, no cart token, the flag kept from the API, and the session left exactly as it
// was (no refresh, no cookie set or cleared). Anywhere else the flag means nothing.

const UUID = '0b6f5a9e-3c1d-4f7a-9e2b-1a2b3c4d5e6f'
const STATUS = `payment/${UUID}/status/`

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: 1 }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

const session = (access = jwtExpiringIn(900)) => ({
  ff_at: access,
  ff_rt: jwtExpiringIn(86_400),
  ff_auth: 'k3J9f0qLx2mN8pR1sT4u',
  ff_cart: 'guest-cart-token',
})

describe('anon=1 on a payment’s status', () => {
  it('reads it without the session: no bearer, no cart token, the flag kept from the API', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff(`${STATUS}?anon=1`, { cookies: session() }))
    expect(res.status).toBe(200)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}${STATUS}`)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
    expect(call?.headers.get('X-API-Key')).toBe('key-123')
    expect(call?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('keeps the other query parameters', async () => {
    const handleBff = await loadHandler()
    await handleBff(...bff(`${STATUS}?a=1&anon=1&b=2`, { cookies: session() }))
    expect(upstreamCalls(fetchSpy)[0]?.url).toBe(`${API}${STATUS}?a=1&b=2`)
  })

  it('never refreshes an expiring session, nor touches its cookies on any answer', async () => {
    fetchSpy.mockImplementation(async () => failure(401, 'token_not_valid'))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff(`${STATUS}?anon=1`, { cookies: session(jwtExpiringIn(5)) }))
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('without the flag, the same read goes with the session (session first)', async () => {
    const access = jwtExpiringIn(900)
    const handleBff = await loadHandler()
    await handleBff(...bff(STATUS, { cookies: session(access) }))
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })
})

describe('anon=1 anywhere else means nothing', () => {
  it.each<[string, string, string]>([
    ['another payment path', `payment/${UUID}/cancel/`, 'POST'],
    ['the history', 'payment/history/', 'GET'],
    ['an order', 'order/0404614013/', 'GET'],
    ['a status path that is not a uuid', 'payment/not-a-uuid/status/', 'GET'],
  ])('%s: the session goes, the flag is forwarded as it came', async (_, path, method) => {
    const access = jwtExpiringIn(900)
    const handleBff = await loadHandler()
    await handleBff(...bff(`${path}?anon=1`, { method, cookies: session(access) }))
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}${path}?anon=1`)
    expect(call?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })

  it('a status read with any other value of the flag goes with the session', async () => {
    const access = jwtExpiringIn(900)
    const handleBff = await loadHandler()
    await handleBff(...bff(`${STATUS}?anon=true`, { cookies: session(access) }))
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })
})
