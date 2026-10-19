// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ApiError as ApiErrorType } from '@/lib/api/errors'

type FetchInit = RequestInit & { next?: { revalidate?: number; tags?: string[] } }

let fetchSpy: MockInstance<typeof fetch>

function envelope(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ msg: 'ok', code: status, data }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

// resetModules gives every test a fresh env memo, so ApiError must come from the same module graph.
async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  const [{ apiFetch }, { ApiError }] = await Promise.all([
    import('@/lib/api/server'),
    import('@/lib/api/errors'),
  ])
  return { apiFetch, ApiError }
}

function lastCall(): { url: string; init: FetchInit; headers: Headers } {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, FetchInit]
  return { url, init, headers: new Headers(init.headers) }
}

beforeEach(() => {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test/')
  vi.stubEnv('SITE_URL', 'https://shop.test/')
  vi.stubEnv('FIREFLY_API_KEY', 'key-123')
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ id: 1 }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('apiFetch request', () => {
  it('calls FIREFLY_API_URL/api/v1/<path> with the API key and Accept header', async () => {
    const { apiFetch } = await load()
    await apiFetch('product/detail/گوشی', { query: { a: [1, 2], b: null } })
    const { url, init, headers } = lastCall()
    expect(url).toBe('https://api.test/api/v1/product/detail/%DA%AF%D9%88%D8%B4%DB%8C/?a=1&a=2')
    expect(init.method).toBe('GET')
    expect(headers.get('X-API-Key')).toBe('key-123')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.has('Content-Type')).toBe(false)
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('X-Forwarded-For')).toBe(false)
    expect(init.body).toBeUndefined()
  })

  it('always ends the path with a slash', async () => {
    const { apiFetch } = await load()
    await apiFetch('cart')
    expect(lastCall().url).toBe('https://api.test/api/v1/cart/')
  })

  it('omits X-API-Key when no key is configured (dev)', async () => {
    vi.stubEnv('FIREFLY_API_KEY', '')
    const { apiFetch } = await load()
    await apiFetch('cart')
    expect(lastCall().headers.has('X-API-Key')).toBe(false)
  })

  it('sends a JSON body with a JSON content type and defaults to POST', async () => {
    const { apiFetch } = await load()
    await apiFetch('cart/item/add', { body: { product: 3, qty: 2 } })
    const { init, headers } = lastCall()
    expect(init.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ product: 3, qty: 2 }))
  })

  it('upper-cases an explicit method', async () => {
    const { apiFetch } = await load()
    await apiFetch('account/profile/me', { method: 'patch', body: { first_name: 'سارا' } })
    expect(lastCall().init.method).toBe('PATCH')
  })

  it('sends FormData untouched and lets fetch set the multipart boundary', async () => {
    const { apiFetch } = await load()
    const form = new FormData()
    form.append('avatar', new Blob(['x']), 'a.png')
    await apiFetch('account/profile/me', { method: 'PATCH', formData: form })
    const { init, headers } = lastCall()
    expect(init.body).toBe(form)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('sends Authorization, X-Cart-Token, Idempotency-Key and X-Forwarded-For when given', async () => {
    const { apiFetch } = await load()
    await apiFetch('order/create', {
      method: 'POST',
      body: {},
      token: 'jwt.access.token',
      cartToken: 'cart-abc',
      idempotencyKey: 'idem-1',
      forwardedFor: '203.0.113.9',
    })
    const { headers } = lastCall()
    expect(headers.get('Authorization')).toBe('Bearer jwt.access.token')
    expect(headers.get('X-Cart-Token')).toBe('cart-abc')
    expect(headers.get('Idempotency-Key')).toBe('idem-1')
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it('ignores null token, cart token and forwarded-for', async () => {
    const { apiFetch } = await load()
    await apiFetch('homepage', { token: null, cartToken: null, forwardedFor: null })
    const { headers } = lastCall()
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('X-Cart-Token')).toBe(false)
    expect(headers.has('X-Forwarded-For')).toBe(false)
  })
})

describe('apiFetch caching', () => {
  it('passes next.revalidate and tags, and no cache option, for an anonymous cached read', async () => {
    const { apiFetch } = await load()
    await apiFetch('menu/main', { revalidate: 300, tags: ['menu'] })
    const { init } = lastCall()
    expect(init.next).toEqual({ revalidate: 300, tags: ['menu'] })
    expect(init.cache).toBeUndefined()
  })

  it('omits tags from next when none are given', async () => {
    const { apiFetch } = await load()
    await apiFetch('homepage', { revalidate: 60 })
    expect(lastCall().init.next).toEqual({ revalidate: 60 })
  })

  it('uses no-store when a token is present, even with revalidate', async () => {
    const { apiFetch } = await load()
    await apiFetch('account/profile/me', { token: 'jwt', revalidate: 60 })
    const { init } = lastCall()
    expect(init.cache).toBe('no-store')
    expect(init.next).toBeUndefined()
  })

  it('uses no-store when only a cart token is present', async () => {
    const { apiFetch } = await load()
    await apiFetch('cart', { cartToken: 'c', revalidate: 60 })
    expect(lastCall().init.cache).toBe('no-store')
    expect(lastCall().init.next).toBeUndefined()
  })

  it('uses no-store for revalidate: false', async () => {
    const { apiFetch } = await load()
    await apiFetch('search', { revalidate: false, tags: ['x'] })
    const { init } = lastCall()
    expect(init.cache).toBe('no-store')
    expect(init.next).toBeUndefined()
  })

  it('uses no-store by default: caching is opt-in', async () => {
    const { apiFetch } = await load()
    await apiFetch('global/settings')
    expect(lastCall().init.cache).toBe('no-store')
    expect(lastCall().init.next).toBeUndefined()
  })

  it('uses no-store for revalidate: 0', async () => {
    const { apiFetch } = await load()
    await apiFetch('global/settings', { revalidate: 0 })
    expect(lastCall().init.cache).toBe('no-store')
  })

  it('never caches a mutation', async () => {
    const { apiFetch } = await load()
    await apiFetch('contact-us/message/submit', { method: 'POST', body: {}, revalidate: 300 })
    expect(lastCall().init.cache).toBe('no-store')
    expect(lastCall().init.next).toBeUndefined()
  })
})

describe('apiFetch response', () => {
  it('returns data, msg, status and the response headers', async () => {
    fetchSpy.mockImplementation(async () => envelope({ token: 't' }, 201, { 'x-cart-token': 'ct' }))
    const { apiFetch } = await load()
    const result = await apiFetch<{ token: string }>('cart/item/add', { method: 'POST', body: {} })
    expect(result.data).toEqual({ token: 't' })
    expect(result.msg).toBe('ok')
    expect(result.status).toBe(201)
    expect(result.headers.get('X-Cart-Token')).toBe('ct')
  })

  it('returns null data for a 204', async () => {
    fetchSpy.mockImplementation(async () => new Response(null, { status: 204 }))
    const { apiFetch } = await load()
    const result = await apiFetch('account/profile/avatar', { method: 'DELETE' })
    expect(result.data).toBeNull()
    expect(result.status).toBe(204)
  })

  it('throws an ApiError built from a non-2xx envelope', async () => {
    fetchSpy.mockImplementation(async () =>
      envelope({ errors: [{ code: 'required', detail: 'الزامی', attr: 'name' }] }, 400),
    )
    const { apiFetch, ApiError } = await load()
    const error = await apiFetch('contact-us/message/submit', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiErrorType).fieldErrors()).toEqual({ name: 'الزامی' })
  })

  it('throws non_json_response for an HTML gateway error', async () => {
    fetchSpy.mockImplementation(async () => new Response('<html>504</html>', { status: 504 }))
    const { apiFetch } = await load()
    await expect(apiFetch('homepage')).rejects.toMatchObject({
      status: 504,
      code: 'non_json_response',
    })
  })
})
