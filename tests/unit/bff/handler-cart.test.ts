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

describe('cart token on special paths', () => {
  it('treats 401 cart_token_required from a signed-in merge as a stale bearer: one refresh, one retry', async () => {
    const stale = jwtExpiringIn(600)
    const fresh = jwtExpiringIn(900)
    let merges = 0
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).endsWith('token/refresh/')) return envelope({ access: fresh })
      merges += 1
      return merges === 1
        ? failure(401, 'cart_token_required')
        : envelope({ token: 'user-cart', adjustments: [] })
    })
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/merge/', {
        method: 'POST',
        cookies: { ff_at: stale, ff_rt: jwtExpiringIn(9999), ff_cart: 'guest' },
      }),
    )
    expect(res.status).toBe(200)
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    const upstream = upstreamCalls(fetchSpy)
    expect(upstream).toHaveLength(2)
    expect(upstream[1]?.headers.get('Authorization')).toBe(`Bearer ${fresh}`)
    expect(upstream[1]?.headers.get('X-Cart-Token')).toBe('guest')
    const cookies = setCookies(res)
    expect(cookies.ff_at?.value).toBe(fresh)
    expect(isCleared(cookies.ff_cart)).toBe(true)
  })

  it('relays cart_token_required from an anonymous merge without refreshing', async () => {
    fetchSpy.mockResolvedValue(failure(401, 'cart_token_required'))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/merge/', { method: 'POST', cookies: { ff_cart: 'guest' } }),
    )
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
  })

  it.each(['account/auth/logout/', 'account/auth/token/refresh/'])(
    'never sends the cart token to the key-only %s',
    async (path) => {
      fetchSpy.mockResolvedValue(envelope({}))
      const handleBff = await loadHandler()
      await handleBff(
        ...bff(path, { method: 'POST', cookies: { ff_rt: jwtExpiringIn(9999), ff_cart: 'guest' } }),
      )
      // The managed refresh path targets the refresh URL itself, so look at every call.
      const [call] = calls(fetchSpy)
      expect(call?.headers.has('X-Cart-Token')).toBe(false)
      expect(call?.headers.has('Authorization')).toBe(false)
    },
  )
})
