// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  API,
  bff,
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

describe('(a) login tokens', () => {
  it('moves data.tokens into httpOnly cookies and removes them from the body', async () => {
    const access = jwtExpiringIn(900)
    const refresh = jwtExpiringIn(2_592_000)
    fetchSpy.mockResolvedValue(
      envelope({ user: { uuid: 'u' }, tokens: { access, refresh }, requires_totp: false }),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/login/', { method: 'POST', json: { login_method: 'email' } }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ user: { uuid: 'u' }, requires_totp: false })
    expect(JSON.stringify(body)).not.toContain(access)
    expect(JSON.stringify(body)).not.toContain(refresh)

    const cookies = setCookies(res)
    expect(cookies.ff_at?.value).toBe(access)
    expect(cookies.ff_rt?.value).toBe(refresh)
    expect(cookies.ff_auth?.value).toBe('1')
    for (const name of ['ff_at', 'ff_rt']) {
      expect(cookies[name]?.attrs.httponly, name).toBe(true)
      expect(cookies[name]?.attrs.secure, name).toBe(true)
      expect(String(cookies[name]?.attrs.samesite).toLowerCase(), name).toBe('lax')
      expect(cookies[name]?.attrs.path, name).toBe('/')
    }
    expect(cookies.ff_auth?.attrs.httponly).toBeUndefined()
    expect(Number(cookies.ff_at?.attrs['max-age'])).toBeGreaterThanOrEqual(898)
    expect(Number(cookies.ff_at?.attrs['max-age'])).toBeLessThanOrEqual(900)
    expect(Number(cookies.ff_rt?.attrs['max-age'])).toBeGreaterThan(2_591_000)
    expect(cookies.ff_auth?.attrs['max-age']).toBe(cookies.ff_rt?.attrs['max-age'])
  })

  it('drops Secure when SITE_URL is plain http', async () => {
    stubEnv('http://localhost:3000')
    fetchSpy.mockResolvedValue(
      envelope({ tokens: { access: jwtExpiringIn(900), refresh: jwtExpiringIn(600) } }),
    )
    const handleBff = await loadHandler()
    const [req, segments] = bff('account/auth/login/', {
      method: 'POST',
      json: {},
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    })
    const cookies = setCookies(await handleBff(req, segments))
    expect(cookies.ff_at?.attrs.secure).toBeUndefined()
    expect(cookies.ff_at?.attrs.httponly).toBe(true)
  })

  it('removes a null tokens key of a TOTP challenge without setting cookies', async () => {
    fetchSpy.mockResolvedValue(envelope({ user: null, tokens: null, requires_totp: true }))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('account/auth/login/', { method: 'POST', json: {} }))
    expect((await res.json()).data).toEqual({ user: null, requires_totp: true })
    expect(res.headers.getSetCookie()).toEqual([])
  })
})

describe('(b) guest cart', () => {
  it('stores data.token of a guest add in ff_cart for 30 days and hides it from the body', async () => {
    fetchSpy.mockResolvedValue(envelope({ token: 'guest-cart-token', items: [] }))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('cart/item/add/', { method: 'POST', json: { variant: 10001, quantity: 1 } }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}cart/item/add/`)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.init.body).toBe(JSON.stringify({ variant: 10001, quantity: 1 }))
    expect(call?.headers.get('Content-Type')).toBe('application/json')

    const cookies = setCookies(res)
    expect(cookies.ff_cart?.value).toBe('guest-cart-token')
    expect(cookies.ff_cart?.attrs.httponly).toBe(true)
    expect(cookies.ff_cart?.attrs['max-age']).toBe(String(30 * 24 * 3600))
    expect((await res.json()).data).toEqual({ items: [] })
  })

  it('sends the stored cart token on the next guest call', async () => {
    fetchSpy.mockResolvedValue(envelope({ token: 'guest-cart-token', items: [1] }))
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/', { cookies: { ff_cart: 'guest-cart-token' } }))
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('X-Cart-Token')).toBe('guest-cart-token')
  })
})

describe('(c) 401 token_not_valid', () => {
  it('refreshes exactly once and retries exactly once with the new token', async () => {
    const stale = jwtExpiringIn(600)
    const fresh = jwtExpiringIn(900)
    let attempts = 0
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).endsWith('token/refresh/')) return envelope({ access: fresh })
      attempts += 1
      return attempts === 1 ? failure(401, 'token_not_valid') : envelope({ uuid: 'sara' })
    })
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/me/', { cookies: { ff_at: stale, ff_rt: jwtExpiringIn(9999) } }),
    )

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ uuid: 'sara' })
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    const upstream = upstreamCalls(fetchSpy)
    expect(upstream).toHaveLength(2)
    expect(upstream[0]?.headers.get('Authorization')).toBe(`Bearer ${stale}`)
    expect(upstream[1]?.headers.get('Authorization')).toBe(`Bearer ${fresh}`)
    expect(setCookies(res).ff_at?.value).toBe(fresh)
  })

  it('does not loop when the retry is rejected too', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('token/refresh/')
        ? envelope({ access: jwtExpiringIn(900) })
        : failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/me/', {
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    expect(upstreamCalls(fetchSpy)).toHaveLength(2)
  })

  it('relays the 401 and clears the session when the refresh token is rejected', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('token/refresh/')
        ? failure(401, 'auth_token_invalid')
        : failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/profile/me/', {
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    expect(res.status).toBe(401)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    const cookies = setCookies(res)
    for (const name of ['ff_at', 'ff_rt', 'ff_auth'])
      expect(isCleared(cookies[name]), name).toBe(true)
  })
})

describe('(d) CSRF', () => {
  it('refuses a write without X-Requested-With: ff, before calling the API', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/item/add/', { method: 'POST', json: {}, csrf: false }))
    expect(res.status).toBe(403)
    expect((await res.json()).data.errors[0].code).toBe('csrf_failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('(e) logout', () => {
  it('injects the refresh cookie, keeps registration_id and clears the session', async () => {
    const refresh = jwtExpiringIn(9999)
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/logout/', {
        method: 'POST',
        json: { registration_id: 'fcm-1', refresh: 'client-supplied' },
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: refresh, ff_cart: 'c' },
      }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(JSON.parse(String(call?.init.body))).toEqual({ registration_id: 'fcm-1', refresh })
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
    const cookies = setCookies(res)
    for (const name of ['ff_at', 'ff_rt', 'ff_auth'])
      expect(isCleared(cookies[name]), name).toBe(true)
    expect(cookies.ff_at?.attrs.path).toBe('/')
    expect(cookies.ff_cart).toBeUndefined()
  })

  it('clears the session even when the API rejects the logout', async () => {
    fetchSpy.mockResolvedValue(failure(400, 'auth_token_invalid'))
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/logout/', { method: 'POST', cookies: { ff_rt: jwtExpiringIn(10) } }),
    )
    expect(res.status).toBe(400)
    expect(JSON.parse(String(upstreamCalls(fetchSpy)[0]?.init.body))).toHaveProperty('refresh')
    expect(isCleared(setCookies(res).ff_rt)).toBe(true)
  })
})

describe('(f) multipart', () => {
  it('streams the body upstream with the original boundary', async () => {
    const form = new FormData()
    form.append('avatar_picture', new Blob(['PNGDATA'], { type: 'image/png' }), 'a.png')
    const handleBff = await loadHandler()
    const [req, segments] = bff('account/profile/me/', { method: 'PATCH', body: form })
    const contentType = req.headers.get('content-type') ?? ''
    const boundary = contentType.split('boundary=')[1] ?? ''
    expect(boundary).not.toBe('')

    await handleBff(req, segments)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.init.method).toBe('PATCH')
    expect(call?.headers.get('Content-Type')).toBe(contentType)
    expect(call?.init.body).toBeInstanceOf(ReadableStream)
    expect((call?.init as { duplex?: string }).duplex).toBe('half')
    const sent = await new Response(call?.init.body).text()
    expect(sent).toContain(`--${boundary}`)
    expect(sent).toContain('PNGDATA')
  })
})
