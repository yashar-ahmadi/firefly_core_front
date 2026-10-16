// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envelope, failure, stubEnv, type FetchSpy } from '../bff/support'

let fetchSpy: FetchSpy

async function load<T>(path: string): Promise<T> {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return (await import(path)) as T
}

function lastCall(): { url: string; init: RequestInit; headers: Headers } {
  const [input, init = {}] = fetchSpy.mock.calls.at(-1) ?? []
  return { url: String(input), init, headers: new Headers(init.headers) }
}

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('robots.txt', () => {
  type Robots = typeof import('@/app/robots.txt/route')
  const content = 'User-agent: *\nDisallow: /cart/\n\nSitemap: https://shop.test/sitemap.xml\n'

  it('serves the operator file byte for byte', async () => {
    fetchSpy.mockResolvedValue(
      new Response(content, { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    )
    const { GET } = await load<Robots>('@/app/robots.txt/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await res.text()).toBe(content)
    const { url, init, headers } = lastCall()
    expect(url).toBe('https://api.test/api/v1/robots/?format=txt')
    expect(headers.get('X-API-Key')).toBe('key-123')
    expect(headers.get('Accept')).toBe('text/plain')
    expect(init.redirect).toBe('manual')
    expect((init as { next?: { revalidate?: number } }).next?.revalidate).toBe(300)
  })

  it.each([
    ['an error text', async () => new Response('کلید نامعتبر', { status: 401 })],
    ['a JSON answer', async () => envelope({ content: 'x' })],
    ['no answer', async (): Promise<Response> => Promise.reject(new TypeError('fetch failed'))],
  ])('answers an uncached 503 with Retry-After on %s', async (_label, answer) => {
    fetchSpy.mockImplementation(answer)
    const { GET } = await load<Robots>('@/app/robots.txt/route')
    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('300')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await res.text()).not.toContain('Disallow')
  })
})

describe('short links', () => {
  type Short = typeof import('@/app/s/[code]/route')
  const visit = async (code: string, headers: Record<string, string> = {}) => {
    const { GET } = await load<Short>('@/app/s/[code]/route')
    const req = new NextRequest(`https://shop.test/s/${code}/`, {
      headers: { 'x-real-ip': '203.0.113.9', ...headers },
    })
    return GET(req, { params: Promise.resolve({ code }) })
  }

  it.each<Record<string, string>>([
    { 'next-router-prefetch': '1' },
    { purpose: 'prefetch' },
    { 'sec-purpose': 'prefetch' },
    { 'sec-purpose': 'prefetch;prerender' },
  ])('answers a prefetch (%o) with an uncached 204 and counts no visit', async (headers) => {
    const res = await visit('phone-fest', headers)
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers an uncached 302 to the target and forwards the visitor IP', async () => {
    fetchSpy.mockResolvedValue(
      envelope({
        code: 'phone-fest',
        target_url: 'https://shop.test/product/list/flagship-phones/',
      }),
    )
    const res = await visit('Phone-Fest')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://shop.test/product/list/flagship-phones/')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { url, init, headers } = lastCall()
    expect(url).toBe('https://api.test/api/v1/shortener/Phone-Fest/')
    expect(init.cache).toBe('no-store')
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it.each([
    ['short_link_not_found', 404],
    ['short_link_expired', 410],
    ['throttled', 503],
  ])('maps %s to a %i page', async (code, status) => {
    fetchSpy.mockResolvedValue(failure(code === 'throttled' ? 429 : 404, code))
    const res = await visit('nope-404')
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('answers 503 when the API cannot be reached', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    expect((await visit('phone-fest')).status).toBe(503)
  })

  it('answers 503 for a target that is not an http(s) URL', async () => {
    fetchSpy.mockResolvedValue(envelope({ code: 'x', target_url: 'javascript:alert(1)' }))
    expect((await visit('phone-fest')).status).toBe(503)
  })

  it.each(['ab', 'a.b.c', 'x'.repeat(51)])(
    'answers 404 for the malformed code %s',
    async (code) => {
      expect((await visit(code)).status).toBe(404)
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
})

describe('bank callback', () => {
  type Callback = typeof import('@/app/api/v1/payment/gateway/callback/[gateway]/[token]/route')
  const callback = async (
    method: 'GET' | 'POST',
    init: { body?: BodyInit; query?: string; gateway?: string; token?: string } = {},
  ) => {
    const mod = await load<Callback>(
      '@/app/api/v1/payment/gateway/callback/[gateway]/[token]/route',
    )
    const gateway = init.gateway ?? 'zarinpal'
    const token = init.token ?? 'tok123'
    const req = new NextRequest(
      `https://shop.test/api/v1/payment/gateway/callback/${gateway}/${token}/${init.query ?? ''}`,
      {
        method,
        body: init.body,
        headers: {
          'x-real-ip': '203.0.113.9',
          cookie: 'ff_rt=secret',
          ...(init.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
      },
    )
    return mod[method](req, { params: Promise.resolve({ gateway, token }) })
  }

  const redirect = () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://shop.test/payment/callback/?result=failed&code=x' },
    })

  it('forwards a POST with its raw body and relays the redirect', async () => {
    fetchSpy.mockResolvedValue(redirect())
    const res = await callback('POST', { body: 'Authority=A1&Status=OK', query: '?a=1' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://shop.test/payment/callback/?result=failed&code=x',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { url, init, headers } = lastCall()
    expect(url).toBe('https://api.test/api/v1/payment/gateway/callback/zarinpal/tok123/?a=1')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('Authority=A1&Status=OK')
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(headers.has('X-API-Key')).toBe(false)
    expect(headers.has('Cookie')).toBe(false)
  })

  it('forwards a GET with its query and no body', async () => {
    fetchSpy.mockResolvedValue(redirect())
    const res = await callback('GET', { query: '?Authority=A1&Status=NOK' })
    expect(res.status).toBe(302)
    const { url, init } = lastCall()
    expect(url).toBe(
      'https://api.test/api/v1/payment/gateway/callback/zarinpal/tok123/?Authority=A1&Status=NOK',
    )
    expect(init.body).toBeUndefined()
  })

  it('relays other answers with their status', async () => {
    fetchSpy.mockResolvedValue(new Response('bad', { status: 400 }))
    const res = await callback('GET')
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('bad')
  })

  it('answers 503 when the backend cannot be reached', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    expect((await callback('POST', { body: 'a=1' })).status).toBe(503)
  })

  it('refuses a body over 64 KiB', async () => {
    const res = await callback('POST', { body: 'a'.repeat(64 * 1024 + 1) })
    expect(res.status).toBe(413)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses dot segments', async () => {
    expect((await callback('GET', { token: '..' })).status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
