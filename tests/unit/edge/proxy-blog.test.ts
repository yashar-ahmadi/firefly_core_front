// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv } from '../bff/support'
import { jwtExpiringIn } from '../support/jwt'

// The blog switch at the edge (Review Focus #1): while it is off, every blog page renders with
// HTTP 503 and `Retry-After`, the page told so by `x-ff-blog-off` (the operator's reason,
// encoded), which a visitor can never send themselves. A page cannot set a 503 itself in Next 16.

const blogSwitchOff = vi.fn()
const refreshAccess = vi.fn()
const knownSources = vi.fn()
const resolveRedirect = vi.fn()

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/edge/blog-switch', () => ({ blogSwitchOff }))
  vi.doMock('@/lib/auth/refresh', () => ({ refreshAccess }))
  vi.doMock('@/lib/edge/redirects', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/edge/redirects')>()),
    knownSources,
    resolveRedirect,
  }))
  return import('@/proxy')
}

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers({ host: 'shop.test', 'x-real-ip': '203.0.113.9', ...init.headers })
  return new NextRequest(`https://shop.test${path}`, { method: init.method ?? 'GET', headers })
}

/** The value the page's request gets for `name` (undefined: the proxy left it as it was). */
function forwarded(res: Response, name: string): string | null | undefined {
  if (res.headers.get('x-middleware-override-headers') === null) return undefined
  const overridden = res.headers.get('x-middleware-override-headers')!.split(',')
  return overridden.includes(name) ? res.headers.get(`x-middleware-request-${name}`) : null
}

const REASON = 'وبلاگ برای به‌روزرسانی تا فردا بسته است.'

beforeEach(() => {
  stubEnv()
  blogSwitchOff.mockResolvedValue({ reason: REASON })
  knownSources.mockResolvedValue(new Set(['/blog/old-post']))
  resolveRedirect.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
  for (const name of ['server-only', '@/lib/edge/blog-switch', '@/lib/auth/refresh']) {
    vi.doUnmock(name)
  }
  vi.doUnmock('@/lib/edge/redirects')
})

describe('a blog page while the blog is switched off', () => {
  it.each(['/blog/', '/blog/?page=2', '/blog/category/tech-news/mobile-blog/', '/blog/a-post/'])(
    '%s renders with 503, Retry-After and the reason for the page',
    async (path) => {
      const { proxy } = await load()
      const res = await proxy(request(path))
      expect(res.status).toBe(503)
      expect(res.headers.get('retry-after')).toBe('300')
      expect(res.headers.get('x-middleware-next')).toBe('1')
      expect(decodeURIComponent(forwarded(res, 'x-ff-blog-off') ?? '')).toBe(REASON)
      expect(forwarded(res, 'x-ff-route-kind')).toBe('page')
    },
  )

  it.each(['/blog/guide.png', '/blog/category/tech-news/x.webp'])(
    '%s (a slug that looks like a file) gets the 503 too',
    async (path) => {
      const { proxy } = await load()
      const res = await proxy(request(path, { headers: { 'x-ff-blog-off': 'forged' } }))
      expect(res.status).toBe(503)
      expect(decodeURIComponent(forwarded(res, 'x-ff-blog-off') ?? '')).toBe(REASON)
    },
  )

  it('without a reason: the header is there, empty', async () => {
    blogSwitchOff.mockResolvedValue({ reason: null })
    const { proxy } = await load()
    const res = await proxy(request('/blog/'))
    expect(res.status).toBe(503)
    expect(forwarded(res, 'x-ff-blog-off')).toBe('')
  })

  it('a router prefetch and a browser one get the 503 too (never a kept 200)', async () => {
    const { proxy } = await load()
    const prefetches: Record<string, string>[] = [
      { rsc: '1', 'next-router-prefetch': '1' },
      { purpose: 'prefetch' },
    ]
    for (const headers of prefetches) {
      const res = await proxy(request('/blog/category/tutorial/', { headers }))
      expect(res.status).toBe(503)
      expect(forwarded(res, 'x-ff-blog-off')).not.toBeNull()
    }
  })

  it('still refreshes the session for the page’s header (cookies set on the 503)', async () => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    const cookie = `ff_rt=${jwtExpiringIn(86_400)}; ff_at=${jwtExpiringIn(5)}`
    const res = await proxy(request('/blog/', { headers: { cookie } }))
    expect(refreshAccess).toHaveBeenCalledOnce()
    expect(res.status).toBe(503)
    expect(res.headers.getSetCookie().some((line) => line.startsWith('ff_at='))).toBe(true)
  })

  it('an operator’s redirect from an old blog URL still wins', async () => {
    resolveRedirect.mockResolvedValue({ status: 301, target: '/blog/new-post/' })
    const { proxy } = await load()
    const res = await proxy(request('/blog/old-post/'))
    expect(res.status).toBe(301)
  })

  it('a write is left to the page (no switch read)', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/blog/', { method: 'POST' }))
    expect(blogSwitchOff).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})

describe('with the blog on, and on other pages', () => {
  it('a blog page renders as usual, and a visitor’s own x-ff-blog-off is dropped', async () => {
    blogSwitchOff.mockResolvedValue(null)
    const { proxy } = await load()
    const res = await proxy(request('/blog/', { headers: { 'x-ff-blog-off': 'forged' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('retry-after')).toBeNull()
    expect(forwarded(res, 'x-ff-blog-off')).toBeNull()
  })

  it.each(['/', '/product/samsung-galaxy-s25-ultra/', '/blogger/', '/page/blog/'])(
    '%s never reads the switch, and drops a forged verdict',
    async (path) => {
      const { proxy } = await load()
      const res = await proxy(request(path, { headers: { 'x-ff-blog-off': 'forged' } }))
      expect(blogSwitchOff).not.toHaveBeenCalled()
      expect(res.status).toBe(200)
      expect(forwarded(res, 'x-ff-blog-off')).toBeNull()
    },
  )

  it('an undecodable blog path is a 404, with no switch read', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/blog/%ZZ/'))
    expect(res.status).toBe(404)
    expect(blogSwitchOff).not.toHaveBeenCalled()
  })
})
