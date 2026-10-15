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

const NOT_FOUND = { code: 'not_found', detail: 'یافت نشد.', attr: null }
const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

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

describe('routing', () => {
  it.each([
    ['a path outside the allow-list', 'redirects/resolve/', 'GET'],
    ['a write to a read-only path', 'global/settings/', 'POST'],
    ['the staff feature toggles', 'global/feature-toggles/', 'GET'],
    ['the bank callback', 'payment/gateway/callback/zarinpal/t/', 'POST'],
  ])('answers 404 for %s without calling the API', async (_label, path, method) => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff(path, { method, json: method === 'GET' ? undefined : {} }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe(404)
    expect(body.data).toEqual({ type: 'client_error', errors: [NOT_FOUND] })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers 404 for dot segments and hidden slashes instead of climbing out of the prefix', async () => {
    const handleBff = await loadHandler()
    for (const segments of [
      ['cart', '..', 'redirects', 'resolve'],
      ['cart', '%2e%2e', 'robots'],
      ['..', 'secureAccessPanel'],
      // What Next hands over for %252e%252e%252f and for an encoded slash inside one segment.
      ['cart', '%2e%2e%2frobots'],
      ['cart', '../robots'],
      ['cart', '..\\robots'],
    ]) {
      const [req] = bff('cart/')
      const res = await handleBff(req, segments)
      expect(res.status, segments.join('/')).toBe(404)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('builds the upstream URL with apiPath: encoded segments, trailing slash, repeated query', async () => {
    const handleBff = await loadHandler()
    const [req] = bff('product/list/?brand=1&brand=2&q=%DA%AF%D9%88%D8%B4%DB%8C&page=2')
    await handleBff(req, ['product', 'detail', 'گوشی a?b'])
    expect(upstreamCalls(fetchSpy)[0]?.url).toBe(
      `${API}product/detail/%DA%AF%D9%88%D8%B4%DB%8C%20a%3Fb/?brand=1&brand=2&q=%DA%AF%D9%88%D8%B4%DB%8C&page=2`,
    )
  })
})

describe('upstream request', () => {
  it('adds the API key, bearer, visitor IP and Idempotency-Key, and nothing from the browser', async () => {
    const access = jwtExpiringIn(600)
    const handleBff = await loadHandler()
    await handleBff(
      ...bff('order/create/', {
        method: 'POST',
        json: { a: 1 },
        cookies: { ff_at: access, ff_rt: jwtExpiringIn(9999), other: 'x' },
        headers: {
          'idempotency-key': 'idem-1',
          authorization: 'Bearer attacker',
          'x-api-key': 'attacker',
          'x-forwarded-for': '6.6.6.6',
          'x-custom': 'nope',
        },
      }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.init.method).toBe('POST')
    expect(call?.init.redirect).toBe('manual')
    expect(call?.init.cache).toBe('no-store')
    expect(call?.headers.get('X-API-Key')).toBe('key-123')
    expect(call?.headers.get('Authorization')).toBe(`Bearer ${access}`)
    expect(call?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(call?.headers.get('Idempotency-Key')).toBe('idem-1')
    expect(call?.headers.get('Accept')).toBe('application/json')
    for (const name of ['cookie', 'x-custom', 'x-requested-with', 'origin', 'host'])
      expect(call?.headers.has(name), name).toBe(false)
  })

  it('ignores session cookies that are not well-formed tokens', async () => {
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/', { cookies: { ff_at: 'not a jwt', ff_cart: 'bad%0D%0Avalue' } }))
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
  })

  it('sends no body on a GET and forwards a JSON body on DELETE', async () => {
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/'))
    expect(upstreamCalls(fetchSpy)[0]?.init.body).toBeUndefined()

    await handleBff(
      ...bff('devices/unregister/', { method: 'DELETE', json: { registration_id: 'fcm-1' } }),
    )
    const del = upstreamCalls(fetchSpy)[1]
    expect(del?.init.method).toBe('DELETE')
    expect(del?.init.body).toBe(JSON.stringify({ registration_id: 'fcm-1' }))
    expect(del?.headers.get('Content-Type')).toBe('application/json')
  })

  it('sends no body and no Content-Type for a bodiless DELETE', async () => {
    const handleBff = await loadHandler()
    await handleBff(...bff('cart/clear/', { method: 'DELETE' }))
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.init.body).toBeUndefined()
    expect(call?.headers.has('Content-Type')).toBe(false)
  })
})

describe('relayed response', () => {
  it('relays status, JSON body and Retry-After, never Set-Cookie, always no-store', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ msg: 'm', code: 429, data: { errors: [], retry_after: 55 } }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '55',
          'set-cookie': 'sessionid=evil; Path=/',
          'x-cart-token': 'leak',
        },
      }),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('search/?q=x'))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('55')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.getSetCookie()).toEqual([])
    expect(res.headers.has('x-cart-token')).toBe(false)
    expect((await res.json()).data.retry_after).toBe(55)
  })

  it('answers an empty 204 for a 204', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('account/address/1/', { method: 'DELETE' }))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('turns an upstream redirect into a 502 envelope without following it', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 301, headers: { location: 'https://evil.test/x' } }),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('product/x/'))
    expect(res.status).toBe(502)
    expect(res.headers.has('location')).toBe(false)
    const body = await res.json()
    expect(body.data.errors[0]).toEqual({
      code: 'upstream_redirect',
      detail: NETWORK_DETAIL,
      attr: null,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('answers 502 network_error when the API cannot be reached', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('homepage/'))
    expect(res.status).toBe(502)
    expect((await res.json()).data.errors[0].code).toBe('network_error')
  })

  it('wraps a non-JSON answer in an envelope, keeping an error status', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>404</html>', { status: 404 }))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('product/x/'))
    expect(res.status).toBe(404)
    expect((await res.json()).data.errors[0].code).toBe('non_json_response')

    fetchSpy.mockResolvedValue(new Response('<html>ok</html>', { status: 200 }))
    expect((await handleBff(...bff('product/x/'))).status).toBe(502)
  })
})

describe('CSRF details', () => {
  it('refuses a wrong X-Requested-With value', async () => {
    const handleBff = await loadHandler()
    const [req, segments] = bff('cart/clear/', {
      method: 'DELETE',
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })
    expect((await handleBff(req, segments)).status).toBe(403)
  })

  it('refuses a write whose Origin is another host', async () => {
    const handleBff = await loadHandler()
    for (const origin of ['https://evil.test', 'null', 'https://shop.test.evil.test']) {
      const [req, segments] = bff('cart/item/add/', {
        method: 'POST',
        json: {},
        headers: { origin },
      })
      expect((await handleBff(req, segments)).status, origin).toBe(403)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts a same-origin write and a GET without the header', async () => {
    const handleBff = await loadHandler()
    const [req, segments] = bff('cart/item/add/', {
      method: 'POST',
      json: {},
      headers: { origin: 'https://shop.test' },
    })
    expect((await handleBff(req, segments)).status).toBe(200)
    expect((await handleBff(...bff('cart/'))).status).toBe(200)
  })
})

describe('streamed uploads', () => {
  it('does not replay a streamed upload after a 401 (the refresh before the call covers expiry)', async () => {
    fetchSpy.mockResolvedValue(failure(401, 'token_not_valid'))
    const form = new FormData()
    form.append('receipt', new Blob(['x']), 'r.jpg')
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('payment/card-to-card/receipt/', {
        method: 'POST',
        body: form,
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    expect(res.status).toBe(401)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
  })
})
