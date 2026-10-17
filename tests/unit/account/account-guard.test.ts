// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCleared, setCookies, stubEnv } from '../bff/support'
import { jwtExpiringIn } from '../support/jwt'

// The account area's session guard (ruling P3-R3). The proxy sees every page request and
// client navigation with its full URL, after its own token refresh: a visitor without a session
// is sent to login there, the page and its query as `next`. The account layout checks the
// refresh cookie again for the requests the proxy's matcher skips (router prefetches).

const refreshAccess = vi.fn()
const resolveRedirect = vi.fn()
const layoutMocks = {
  cookies: new Map<string, string>(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}

async function loadProxy() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/auth/refresh', () => ({ refreshAccess }))
  vi.doMock('@/lib/edge/redirects', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/edge/redirects')>()),
    knownSources: async () => new Set<string>(),
    resolveRedirect,
  }))
  return (await import('@/proxy')).proxy
}

function request(path: string, cookies: Record<string, string> = {}, method = 'GET') {
  const headers = new Headers({ host: 'shop.test', 'x-real-ip': '203.0.113.9' })
  const pairs = Object.entries(cookies).map(([name, value]) => `${name}=${value}`)
  if (pairs.length > 0) headers.set('cookie', pairs.join('; '))
  return new NextRequest(`https://shop.test${path}`, { method, headers })
}

const REFRESH = jwtExpiringIn(7 * 24 * 3600)

beforeEach(() => {
  stubEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
  vi.doUnmock('@/lib/auth/refresh')
  vi.doUnmock('@/lib/edge/redirects')
})

describe('the account guard in the proxy', () => {
  it.each([
    ['/account/', '/login/?next=/account/'],
    ['/account/orders/?group=delivered', '/login/?next=/account/orders/%3Fgroup%3Ddelivered'],
    ['/account/wallet/?a=1&b=%D8%B3', '/login/?next=/account/wallet/%3Fa%3D1%26b%3D%25D8%25B3'],
  ])('sends a visitor without a session from %s to %s', async (path, login) => {
    const proxy = await loadProxy()
    const res = await proxy(request(path))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`https://shop.test${login}`)
    // Nothing to clear, nothing to refresh.
    expect(res.headers.getSetCookie()).toEqual([])
    expect(refreshAccess).not.toHaveBeenCalled()
  })

  it("keeps a client navigation's page in next, without Next's own _rsc parameter", async () => {
    const proxy = await loadProxy()
    const res = await proxy(request('/account/orders/?group=returned&_rsc=1x2y3'))
    expect(res.headers.get('location')).toBe(
      'https://shop.test/login/?next=/account/orders/%3Fgroup%3Dreturned',
    )
  })

  it('clears a session flag left without its refresh cookie, so login shows the form', async () => {
    const proxy = await loadProxy()
    const res = await proxy(request('/account/', { ff_auth: '1', ff_at: jwtExpiringIn(600) }))
    expect(res.status).toBe(307)
    const cookies = setCookies(res)
    for (const name of ['ff_at', 'ff_rt', 'ff_auth']) {
      expect(isCleared(cookies[name]), name).toBe(true)
      expect(cookies[name]?.attrs.path).toBe('/')
    }
  })

  it('treats a refresh cookie that is no token as none', async () => {
    const proxy = await loadProxy()
    const res = await proxy(request('/account/', { ff_rt: 'not-a-jwt', ff_auth: '1' }))
    expect(res.status).toBe(307)
    expect(refreshAccess).not.toHaveBeenCalled()
  })

  it.each(['invalid', 'inactive'] as const)(
    'when the refresh is %s: login, the session cookies cleared on the way',
    async (error) => {
      refreshAccess.mockResolvedValue({ error })
      const proxy = await loadProxy()
      const res = await proxy(request('/account/reviews/', { ff_rt: REFRESH, ff_auth: '1' }))
      expect(refreshAccess).toHaveBeenCalledWith(REFRESH, '203.0.113.9')
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('https://shop.test/login/?next=/account/reviews/')
      const cookies = setCookies(res)
      for (const name of ['ff_at', 'ff_rt', 'ff_auth']) expect(isCleared(cookies[name])).toBe(true)
    },
  )

  it('renders the page for a session: a fresh access token, or one just refreshed', async () => {
    const proxy = await loadProxy()
    const fresh = await proxy(request('/account/', { ff_at: jwtExpiringIn(600), ff_rt: REFRESH }))
    expect(fresh.headers.get('x-middleware-next')).toBe('1')
    expect(fresh.headers.get('location')).toBeNull()

    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const refreshed = await proxy(request('/account/', { ff_rt: REFRESH }))
    expect(refreshed.headers.get('x-middleware-next')).toBe('1')
    expect(setCookies(refreshed).ff_auth?.value).toBe('1')
  })

  it('renders the page when the API cannot be reached: the session may well be alive', async () => {
    refreshAccess.mockResolvedValue({ error: 'network' })
    const proxy = await loadProxy()
    const res = await proxy(request('/account/', { ff_rt: REFRESH }))
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('location')).toBeNull()
  })

  it.each(['/', '/accounting/', '/product/x/', '/login/?next=/account/'])(
    'leaves %s alone without a session',
    async (path) => {
      const proxy = await loadProxy()
      const res = await proxy(request(path))
      expect(res.headers.get('x-middleware-next')).toBe('1')
      expect(res.headers.get('location')).toBeNull()
    },
  )

  it('never redirects a write: the layout answers it', async () => {
    const proxy = await loadProxy()
    const res = await proxy(request('/account/', {}, 'POST'))
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('the account layout guard', () => {
  async function loadLayout() {
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    vi.doMock('next/headers', () => ({
      cookies: async () => ({
        get: (name: string) =>
          layoutMocks.cookies.has(name)
            ? { name, value: layoutMocks.cookies.get(name) }
            : undefined,
        has: (name: string) => layoutMocks.cookies.has(name),
      }),
    }))
    vi.doMock('next/navigation', () => ({ redirect: layoutMocks.redirect }))
    return import('@/app/(shop)/account/layout')
  }

  afterEach(() => {
    layoutMocks.cookies.clear()
    vi.doUnmock('next/headers')
    vi.doUnmock('next/navigation')
  })

  it('redirects to login when the refresh cookie is missing (a request the proxy skipped)', async () => {
    const { default: AccountLayout } = await loadLayout()
    await expect(AccountLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT')
    expect(layoutMocks.redirect).toHaveBeenCalledExactlyOnceWith('/login/?next=/account/')
  })

  it('redirects when the refresh cookie holds no token', async () => {
    layoutMocks.cookies.set('ff_rt', 'garbage')
    const { default: AccountLayout } = await loadLayout()
    await expect(AccountLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('renders the account shell with a session', async () => {
    layoutMocks.cookies.set('ff_rt', REFRESH)
    const { default: AccountLayout } = await loadLayout()
    await expect(AccountLayout({ children: 'page' })).resolves.toBeTruthy()
    expect(layoutMocks.redirect).not.toHaveBeenCalled()
  })

  it('is per visitor and kept out of search results (P3-R3)', async () => {
    const layout = await loadLayout()
    expect(layout.dynamic).toBe('force-dynamic')
    expect(layout.metadata.robots).toEqual({ index: false, follow: false })
  })
})
