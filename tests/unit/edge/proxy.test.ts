// @vitest-environment node
import { NextRequest } from 'next/server'
import { getRewrittenUrl } from 'next/experimental/testing/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import { isCleared, setCookies, stubEnv } from '../bff/support'

const refreshAccess = vi.fn()
const knownSources = vi.fn()
const resolveRedirect = vi.fn()

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/auth/refresh', () => ({ refreshAccess }))
  vi.doMock('@/lib/edge/redirects', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/edge/redirects')>()),
    knownSources,
    resolveRedirect,
  }))
  return import('@/proxy')
}

interface Init {
  method?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

function request(path: string, init: Init = {}): NextRequest {
  const headers = new Headers({ host: 'shop.test', 'x-real-ip': '203.0.113.9', ...init.headers })
  if (init.cookies) {
    const pairs = Object.entries(init.cookies).map(([name, value]) => `${name}=${value}`)
    headers.set('cookie', pairs.join('; '))
  }
  return new NextRequest(`https://shop.test${path}`, { method: init.method ?? 'GET', headers })
}

/** The cookie header the proxy hands to the rendering request, or undefined when unchanged. */
function forwardedCookies(res: Response): string | null | undefined {
  const overridden = res.headers.get('x-middleware-override-headers')
  if (overridden === null) return undefined
  return res.headers.get('x-middleware-request-cookie')
}

beforeEach(() => {
  stubEnv()
  knownSources.mockResolvedValue(new Set(['/festival', '/product/nokia-3310-classic']))
  resolveRedirect.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
  vi.doUnmock('@/lib/auth/refresh')
  vi.doUnmock('@/lib/edge/redirects')
})

describe('undecodable paths', () => {
  const NO_RULE = new Set(['/festival'])

  it.each([
    '/product-category/abc%ZZ/',
    '/product-category/digital/%E0%A4%A/',
    // Extension-bearing catalog paths are not asset files: they reach the guard too.
    '/product-category/abc%ZZ.png',
    '/brand/x%ZZ.jpg',
    '/product/x%ZZ.png',
  ])(
    'answers %s with a 404 page after the redirect lookup, without asking the API',
    async (path) => {
      knownSources.mockResolvedValue(NO_RULE)
      const { proxy } = await load()
      const res = await proxy(request(path, { cookies: { ff_rt: jwtExpiringIn(-60) } }))
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.text()).toContain('<title>صفحه پیدا نشد</title>')
      expect(getRewrittenUrl(res as never)).toBeNull()
      // Random garbage costs no API call: its spelling is not a rule source.
      expect(resolveRedirect).not.toHaveBeenCalled()
      expect(refreshAccess).not.toHaveBeenCalled()
    },
  )

  it('answers an undecodable media path with a 404 page instead of forwarding it', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/media/%E0%A4%A.png'))
    expect(res.status).toBe(404)
    expect(getRewrittenUrl(res as never)).toBeNull()
    expect(knownSources).not.toHaveBeenCalled()
  })

  it('redirects a legacy non-UTF-8 path that is a rule source (spelled as the backend does)', async () => {
    knownSources.mockResolvedValue(new Set(['/old/\u{FFFD}\u{FFFD}']))
    resolveRedirect.mockResolvedValue({ status: 301, target: '/product/new/' })
    const { proxy } = await load()
    const res = await proxy(request('/old/%C7%E1/'))
    expect(resolveRedirect).toHaveBeenCalledWith('/old/%C7%E1/', '203.0.113.9')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://shop.test/product/new/')
  })

  it('still answers 404 when a listed legacy path has no rule after all', async () => {
    knownSources.mockResolvedValue(new Set(['/old/\u{FFFD}\u{FFFD}']))
    const { proxy } = await load()
    const res = await proxy(request('/old/%C7%E1/', { cookies: { ff_rt: jwtExpiringIn(-60) } }))
    expect(resolveRedirect).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(404)
    expect(refreshAccess).not.toHaveBeenCalled()
  })

  it('never asks the API about an undecodable path it cannot spell', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/a%ZZ%2Fb/'))
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(res.status).toBe(404)
  })

  it('lets a well-formed encoded path through', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/product-category/%DA%A9%D8%A7%D9%84%D8%A7/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('leaves a decodable catalog path with an extension to its page', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/product/x.png', { cookies: { ff_rt: jwtExpiringIn(-60) } }))
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(refreshAccess).not.toHaveBeenCalled()
  })
})

describe('forwarding', () => {
  it.each([
    ['/media/a/logo.png?v=2', 'https://api.test/media/a/logo.png?v=2'],
    ['/static/defaults/default.png', 'https://api.test/static/defaults/default.png'],
    ['/sitemap.xml?p=1', 'https://api.test/sitemap.xml?p=1'],
  ])('rewrites %s to the API', async (path, target) => {
    const { proxy } = await load()
    const res = await proxy(request(path, { cookies: { ff_rt: jwtExpiringIn(9999) } }))
    expect(getRewrittenUrl(res as never)).toBe(target)
    expect(refreshAccess).not.toHaveBeenCalled()
    expect(knownSources).not.toHaveBeenCalled()
  })

  it('does not hand the session cookies or credentials to the API', async () => {
    const { proxy } = await load()
    const res = await proxy(
      request('/media/a.png', {
        cookies: { ff_rt: 'r', theme: 'x' },
        headers: { authorization: 'Bearer secret' },
      }),
    )
    const overridden = res.headers.get('x-middleware-override-headers')?.split(',') ?? []
    expect(overridden).toContain('x-real-ip')
    expect(overridden).not.toContain('cookie')
    expect(overridden).not.toContain('authorization')
    expect(res.headers.has('x-middleware-request-cookie')).toBe(false)
    expect(res.headers.has('x-middleware-request-authorization')).toBe(false)
  })
})

describe('redirects', () => {
  it('answers a listed path with the rule status and target', async () => {
    resolveRedirect.mockResolvedValue({
      status: 302,
      target: '/product-category/digital/mobile-phone/',
    })
    const { proxy } = await load()
    const res = await proxy(request('/festival/?utm_source=sms'))
    expect(resolveRedirect).toHaveBeenCalledWith('/festival/?utm_source=sms', '203.0.113.9')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://shop.test/product-category/digital/mobile-phone/',
    )
  })

  it('keeps absolute targets', async () => {
    resolveRedirect.mockResolvedValue({ status: 301, target: 'https://other.test/x/' })
    const { proxy } = await load()
    const res = await proxy(request('/festival/', { method: 'HEAD' }))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://other.test/x/')
  })

  it.each(['javascript:alert(1)', 'http://'])('ignores the unusable target %s', async (target) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    resolveRedirect.mockResolvedValue({ status: 302, target })
    const { proxy } = await load()
    const res = await proxy(request('/festival/'))
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('location')).toBeNull()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('answers a gone rule with a 410 page', async () => {
    resolveRedirect.mockResolvedValue({ status: 410, target: '' })
    const { proxy } = await load()
    const res = await proxy(request('/product/nokia-3310-classic/'))
    expect(res.status).toBe(410)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('does not ask the API about paths without a rule', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/product/other/'))
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('asks the API when the path has no local spelling', async () => {
    const { proxy } = await load()
    await proxy(request('/a%2Fb/'))
    expect(resolveRedirect).toHaveBeenCalledWith('/a%2Fb/', '203.0.113.9')
  })

  it('never resolves a browser prefetch', async () => {
    resolveRedirect.mockResolvedValue({ status: 302, target: '/x/' })
    const { proxy } = await load()
    const res = await proxy(request('/festival/', { headers: { purpose: 'prefetch' } }))
    expect(knownSources).not.toHaveBeenCalled()
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it.each(['/old-page.html', '/catalog/item.htm', '/index.php', '/default.asp', '/list.aspx'])(
    'resolves the legacy page URL %s',
    async (path) => {
      knownSources.mockResolvedValue(new Set([path]))
      resolveRedirect.mockResolvedValue({ status: 301, target: '/new/' })
      const { proxy } = await load()
      const res = await proxy(request(path))
      expect(resolveRedirect).toHaveBeenCalledWith(path, '203.0.113.9')
      expect(res.status).toBe(301)
    },
  )

  it('never redirects writes', async () => {
    resolveRedirect.mockResolvedValue({ status: 302, target: '/x/' })
    const { proxy } = await load()
    const res = await proxy(request('/festival/', { method: 'POST' }))
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('renders the page when the API has no answer', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/festival/'))
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})

describe('session refresh', () => {
  const refresh = jwtExpiringIn(7 * 24 * 3600)

  it('refreshes an expiring access token for the page and the browser', async () => {
    const fresh = jwtExpiringIn(900)
    refreshAccess.mockResolvedValue({ access: fresh })
    const { proxy } = await load()
    const res = await proxy(
      request('/product/x/', { cookies: { theme: 'a', ff_at: jwtExpiringIn(5), ff_rt: refresh } }),
    )
    expect(refreshAccess).toHaveBeenCalledWith(refresh, '203.0.113.9')
    const cookies = setCookies(res)
    expect(cookies.ff_at?.value).toBe(fresh)
    expect(cookies.ff_at?.attrs.httponly).toBe(true)
    expect(Number(cookies.ff_at?.attrs['max-age'])).toBeGreaterThan(890)
    // No flag cookie came with it: a new session marker, for the browser and for this render.
    const marker = cookies.ff_auth?.value ?? ''
    expect(marker).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
    expect(cookies.ff_auth?.attrs.httponly).toBeUndefined()
    expect(cookies.ff_auth?.attrs['max-age']).toBe(cookies.ff_rt?.attrs['max-age'])
    const forwarded = forwardedCookies(res)
    expect(forwarded).toContain(`ff_at=${fresh}`)
    expect(forwarded).toContain(`ff_rt=${refresh}`)
    expect(forwarded).toContain(`ff_auth=${marker}`)
    expect(forwarded).toContain('theme=a')
  })

  it.each([
    ['a session marker', 'kept-marker-0123456789'],
    ['the flag of a session from before markers', '1'],
  ])('keeps %s across the refresh (the same login)', async (_, marker) => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    const res = await proxy(
      request('/product/x/', { cookies: { ff_rt: refresh, ff_auth: marker } }),
    )
    expect(setCookies(res).ff_auth?.value).toBe(marker)
    expect(forwardedCookies(res)).toContain(`ff_auth=${marker}`)
  })

  it('replaces a flag cookie that is no marker (tampered) with a new one', async () => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    const tampered = 'x'.repeat(65)
    const res = await proxy(
      request('/product/x/', { cookies: { ff_rt: refresh, ff_auth: tampered } }),
    )
    const marker = setCookies(res).ff_auth?.value
    expect(marker).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
    expect(forwardedCookies(res)).not.toContain(tampered)
  })

  it('refreshes a missing access token', async () => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    await proxy(request('/', { cookies: { ff_rt: refresh } }))
    expect(refreshAccess).toHaveBeenCalledTimes(1)
  })

  it.each(['invalid', 'inactive'] as const)(
    'ends the session when the refresh is %s',
    async (error) => {
      refreshAccess.mockResolvedValue({ error })
      const { proxy } = await load()
      const res = await proxy(
        request('/product/x/', { cookies: { theme: 'a', ff_rt: refresh, ff_auth: '1' } }),
      )
      const cookies = setCookies(res)
      for (const name of ['ff_at', 'ff_rt', 'ff_auth']) {
        expect(isCleared(cookies[name])).toBe(true)
        expect(cookies[name]?.attrs.path).toBe('/')
      }
      const forwarded = forwardedCookies(res) ?? ''
      expect(forwarded).toBe('theme=a')
    },
  )

  it('keeps the cookies when the API cannot be reached', async () => {
    refreshAccess.mockResolvedValue({ error: 'network', retryAfter: null })
    const { proxy } = await load()
    const res = await proxy(request('/product/x/', { cookies: { ff_rt: refresh } }))
    expect(res.headers.getSetCookie()).toEqual([])
    expect(forwardedCookies(res)).toBeUndefined()
  })

  it('leaves a fresh access token alone', async () => {
    const { proxy } = await load()
    const res = await proxy(
      request('/product/x/', { cookies: { ff_at: jwtExpiringIn(600), ff_rt: refresh } }),
    )
    expect(refreshAccess).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('does nothing without a refresh token', async () => {
    const { proxy } = await load()
    await proxy(request('/product/x/', { cookies: { ff_at: jwtExpiringIn(5) } }))
    expect(refreshAccess).not.toHaveBeenCalled()
  })

  it.each([
    '/api/bff/cart/',
    '/s/phone-fest/',
    '/_next/static/x.js',
    '/logo.svg',
    '/healthz',
    '/healthz/',
  ])('does no session work on %s', async (path) => {
    const { proxy } = await load()
    const res = await proxy(request(path, { cookies: { ff_rt: refresh } }))
    expect(refreshAccess).not.toHaveBeenCalled()
    expect(knownSources).not.toHaveBeenCalled()
    expect(resolveRedirect).not.toHaveBeenCalled()
    // Passed through untouched: no rewrite, no cookies, no request header changes.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.getSetCookie()).toEqual([])
    expect(forwardedCookies(res)).toBeUndefined()
  })
})
