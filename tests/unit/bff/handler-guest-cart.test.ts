// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  API,
  bff,
  envelope,
  failure,
  loadHandler,
  upstreamCalls,
  stubEnv,
  type FetchSpy,
} from './support'

const CART_URL = `${API}cart/`

function emptyCart(extra: Record<string, unknown> = {}) {
  return { token: '', item_count: 0, is_empty: true, lines: [], total: 0, ...extra }
}

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope(emptyCart()))
})

afterEach(() => {
  vi.useRealTimers()
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('guest GET cart/ from the shared copy', () => {
  it('fills the copy once without a cart token, bearer or visitor IP, then serves it', async () => {
    const handleBff = await loadHandler()
    const first = await handleBff(...bff('cart/'))
    const second = await handleBff(...bff('cart/'))

    const calls = upstreamCalls(fetchSpy)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(CART_URL)
    expect(calls[0]?.headers.get('X-API-Key')).toBe('key-123')
    for (const name of ['X-Cart-Token', 'Authorization', 'X-Forwarded-For', 'Idempotency-Key'])
      expect(calls[0]?.headers.has(name), name).toBe(false)

    for (const res of [first, second]) {
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
      expect(res.headers.getSetCookie()).toEqual([])
      // Stripped exactly like a proxied cart answer: no `token` reaches the browser.
      expect(await res.json()).toEqual({
        msg: 'm',
        code: 200,
        data: { item_count: 0, is_empty: true, lines: [], total: 0 },
      })
    }
  })

  it('answers with the same body as the proxied guest read', async () => {
    const handleBff = await loadHandler()
    const shortcut = await (await handleBff(...bff('cart/'))).text()
    // A stray unrelated cookie is not a session; a malformed cart cookie still forces the proxy.
    const proxied = await (await handleBff(...bff('cart/', { cookies: { ff_cart: '' } }))).text()
    expect(shortcut).toBe(proxied)
  })

  it.each([
    ['a guest cart cookie', { cookies: { ff_cart: 'guest-token' } }],
    ['a malformed guest cart cookie', { cookies: { ff_cart: 'bad%0D%0Avalue' } }],
    ['an access cookie', { cookies: { ff_at: jwtExpiringIn(600) } }],
    ['a malformed access cookie', { cookies: { ff_at: 'nope' } }],
    ['a refresh cookie', { cookies: { ff_rt: jwtExpiringIn(9999) } }],
    ['the session flag', { cookies: { ff_auth: '1' } }],
  ])('never answers a request with %s from the copy', async (_label, init) => {
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)

    await handleBff(...bff('cart/', init))
    const calls = upstreamCalls(fetchSpy)
    expect(calls).toHaveLength(2)
    // The proxied call carries the visitor IP, unlike the fill.
    expect(calls[1]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it.each([
    ['a query string', 'cart/?coupon=1', 'GET'],
    ['another cart path', 'cart/item/5/', 'GET'],
    ['a write', 'cart/clear/', 'DELETE'],
  ])('never uses the copy for %s', async (_label, path, method) => {
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/'))
    await handleBff(...bff(path, { method }))
    const calls = upstreamCalls(fetchSpy)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it('checks the CSRF header before the copy', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/', { csrf: false }))
    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('what the copy keeps', () => {
  it.each([
    ['a cart with items', emptyCart({ is_empty: false, item_count: 2 })],
    ['a cart with lines', emptyCart({ lines: [{ variant: 1 }] })],
    ['a non-zero count', emptyCart({ item_count: 1 })],
    ['a cart token', emptyCart({ token: 'leaked-token' })],
    ['no emptiness flag', { item_count: 0, lines: [] }],
  ])('never stores %s and proxies the request instead', async (_label, data) => {
    fetchSpy.mockImplementation(async () => envelope(data))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).not.toHaveProperty('token')
    // Fill, then the normal proxied call with the visitor IP.
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)
    expect(upstreamCalls(fetchSpy)[1]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')

    // Within the fill backoff: proxied, without trying to fill again.
    await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)).toHaveLength(3)
    expect(upstreamCalls(fetchSpy)[2]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it.each([
    ['a 500', () => failure(500, 'server_error')],
    ['a 429', () => failure(429, 'throttled')],
    ['a 200 that is not JSON', () => new Response('<html>', { status: 200 })],
  ])('never stores %s', async (_label, response) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    fetchSpy.mockImplementation(async () => response())
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)
    expect(res.status).not.toBe(200)

    fetchSpy.mockImplementation(async () => envelope(emptyCart()))
    vi.setSystemTime(new Date('2026-10-16T10:00:10Z'))
    await handleBff(...bff('cart/'))
    await handleBff(...bff('cart/'))
    // A new fill once the backoff after the error is over, then the copy.
    expect(upstreamCalls(fetchSpy)).toHaveLength(3)
  })

  it('waits 10 seconds after a failed fill before filling again; meanwhile it proxies', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    fetchSpy.mockImplementation(async () => failure(500, 'server_error'))
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/'))
    // The failed fill, then the proxied request.
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)

    fetchSpy.mockImplementation(async () => envelope(emptyCart()))
    vi.setSystemTime(new Date('2026-10-16T10:00:09.999Z'))
    const meanwhile = await handleBff(...bff('cart/'))
    expect(meanwhile.status).toBe(200)
    const calls = upstreamCalls(fetchSpy)
    expect(calls).toHaveLength(3)
    // Proxied as usual (the visitor's IP goes along), and the error was never stored.
    expect(calls[2]?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')

    vi.setSystemTime(new Date('2026-10-16T10:00:10Z'))
    await handleBff(...bff('cart/'))
    await handleBff(...bff('cart/'))
    // One new fill (no visitor IP), then the copy.
    expect(upstreamCalls(fetchSpy)).toHaveLength(4)
    expect(upstreamCalls(fetchSpy)[3]?.headers.has('X-Forwarded-For')).toBe(false)
  })

  it('falls through to the proxy when the API cannot be reached', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/'))
    expect(res.status).toBe(200)
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)
  })

  it('refreshes the copy after 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/'))
    vi.setSystemTime(new Date('2026-10-16T10:00:59.999Z'))
    await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)

    vi.setSystemTime(new Date('2026-10-16T10:01:00Z'))
    await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)
    expect(upstreamCalls(fetchSpy)[1]?.headers.has('X-Forwarded-For')).toBe(false)
  })

  it('makes one upstream call for concurrent misses', async () => {
    let release: (res: Response) => void = () => undefined
    fetchSpy.mockImplementation(
      () => new Promise<Response>((resolve) => (release = () => resolve(envelope(emptyCart())))),
    )
    const handleBff = await loadHandler()
    const pending = Array.from({ length: 5 }, () => handleBff(...bff('cart/')))
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    release(envelope(emptyCart()))
    const responses = await Promise.all(pending)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    for (const res of responses) expect(res.status).toBe(200)
  })
})
