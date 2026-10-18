// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isQuietPrefetch } from '@/lib/http/prefetch'
import shapes from '../../fixtures/rsc-request-shapes.json'
import { jwtExpiringIn } from '../support/jwt'
import { isCleared, setCookies, stubEnv } from '../bff/support'

// The App Router's own requests as the proxy really receives them (tests/fixtures/rsc-request-
// shapes.json, captured from the production build). Without `skipProxyUrlNormalize`, Next removes
// its flight headers and `_rsc` before the proxy runs: a router prefetch and a client navigation
// arrive identical, and the prefetch got the session refresh and the account guard (a refresh
// answering after a tab's logout set the session cookies again). With it (next.config.ts), a
// prefetch is marked with its route kind and nothing more, a navigation still gets the refresh
// and the guard; the proxy leaves Next's `_rsc` out of what it builds (its redirects stay on the
// request's own URL, which Next's router turns into a relative Location: tests/e2e/edge.spec.ts).

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
  return (await import('@/proxy')).proxy
}

type Shape = { query: string; headers: Record<string, string> }
const real = shapes.skipProxyUrlNormalize

/** `shape` sent to `path` (its own `_rsc`), on the server's listening address, with `cookie`. */
function sent(shape: Shape, path: string, cookie?: string) {
  const headers = new Headers({
    ...shape.headers,
    host: 'localhost:3000',
    'x-real-ip': '203.0.113.9',
  })
  if (cookie) headers.set('cookie', cookie)
  const query = [path.split('?')[1], shape.query].filter(Boolean).join('&')
  return new NextRequest(`http://0.0.0.0:3000${path.split('?')[0]}${query ? `?${query}` : ''}`, {
    headers,
  })
}

const kindOf = (res: Response) => res.headers.get('x-middleware-request-x-ff-route-kind')
const SESSION = () =>
  `ff_at=${jwtExpiringIn(5)}; ff_rt=${jwtExpiringIn(86_400)}; ff_auth=k3J9f0qLx2mN8pR1sT4u`
/** A tab whose session ended elsewhere: only the flag cookie is left. */
const LEFTOVER = 'ff_auth=k3J9f0qLx2mN8pR1sT4u'

beforeEach(() => {
  stubEnv()
  refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
  knownSources.mockResolvedValue(new Set(['/festival']))
  resolveRedirect.mockResolvedValue({ status: 301, target: '/elsewhere/' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
  vi.doUnmock('@/lib/auth/refresh')
  vi.doUnmock('@/lib/edge/redirects')
})

describe('what reaches the proxy', () => {
  it('next.config hands the proxy the request as sent (`skipProxyUrlNormalize`)', async () => {
    const nextConfig = (await import('../../../next.config')).default
    expect(nextConfig.skipProxyUrlNormalize).toBe(true)
  })

  it('by default, a router prefetch and a navigation are indistinguishable', () => {
    const { routerPrefetch, navigation } = shapes.default
    expect(isQuietPrefetch(new Headers(routerPrefetch.headers))).toBe(false)
    expect(isQuietPrefetch(new Headers(navigation.headers))).toBe(false)
    expect(Object.keys(routerPrefetch.headers).sort()).toEqual(
      Object.keys(navigation.headers).sort(),
    )
    expect(routerPrefetch.query).toBe('')
  })

  it('with skipProxyUrlNormalize, both router prefetches and a document prefetch are quiet; a navigation is not', () => {
    expect(isQuietPrefetch(new Headers(real.treePrefetch.headers))).toBe(true)
    expect(isQuietPrefetch(new Headers(real.dynamicPrefetch.headers))).toBe(true)
    expect(isQuietPrefetch(new Headers(real.documentPrefetch.headers))).toBe(true)
    expect(isQuietPrefetch(new Headers(real.navigation.headers))).toBe(false)
    expect(real.navigation.query).toMatch(/^_rsc=/)
  })
})

describe('a router prefetch', () => {
  it.each([
    ['tree', real.treePrefetch],
    ['dynamic', real.dynamicPrefetch],
  ])(
    '(%s) of an account page: marked, no refresh, no guard, no redirect lookup',
    async (_, shape) => {
      const proxy = await load()
      for (const cookie of [SESSION(), LEFTOVER, undefined]) {
        const res = await proxy(sent(shape, '/account/profile/', cookie))
        expect(kindOf(res)).toBe('page')
        expect(res.headers.get('location')).toBeNull()
        expect(res.headers.getSetCookie()).toEqual([])
      }
      expect(refreshAccess).not.toHaveBeenCalled()
      expect(knownSources).not.toHaveBeenCalled()
      expect(resolveRedirect).not.toHaveBeenCalled()
    },
  )

  it('of a payment page: marked as a credential page', async () => {
    const proxy = await load()
    const res = await proxy(sent(real.treePrefetch, '/payment/callback/?result=success'))
    expect(kindOf(res)).toBe('credential')
  })
})

describe('a client navigation', () => {
  it('to an account page without a session: login, `_rsc` left out of `next`', async () => {
    const proxy = await load()
    const res = await proxy(sent(real.navigation, '/account/profile/?tab=a b', LEFTOVER))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://0.0.0.0:3000/login/?next=/account/profile/%3Ftab%3Da%2520b',
    )
    expect(isCleared(setCookies(res).ff_auth)).toBe(true)
  })

  it('with an expiring session: refreshed, the new cookies set and rendered with', async () => {
    const proxy = await load()
    const res = await proxy(sent(real.navigation, '/account/profile/', SESSION()))
    expect(refreshAccess).toHaveBeenCalledTimes(1)
    expect(setCookies(res).ff_at?.value).toBeTruthy()
    expect(kindOf(res)).toBe('page')
    expect(res.headers.get('location')).toBeNull()
  })

  it('to an operator redirect source: looked up without `_rsc`, redirected', async () => {
    const proxy = await load()
    const res = await proxy(sent(real.navigation, '/festival/'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('http://0.0.0.0:3000/elsewhere/')
    expect(resolveRedirect).toHaveBeenCalledWith('/festival/', '203.0.113.9')
  })
})
