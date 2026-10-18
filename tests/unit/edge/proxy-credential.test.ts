// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import { stubEnv } from '../bff/support'

// The proxy marks every page it serves for the layouts (`x-ff-route-kind`): `credential` for a
// page whose URL holds a payment link's token or a payment's uuid (or leads back to one after a
// login), `page` for any other. Operator code renders only on `page` (fail closed: an unmarked
// request gets none). A visitor's own header is never trusted, and a payment page is never looked
// up as an operator redirect (its path never reaches the redirect API, nor a log).

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

const TOKEN = 'k3J9f0qLx2mN8pR1sT4uV7wY0zA3bC6dE9gH2jK5mN8'

function request(path: string, headers: Record<string, string> = {}, cookie?: string) {
  const all = new Headers({ host: 'shop.test', 'x-real-ip': '203.0.113.9', ...headers })
  if (cookie) all.set('cookie', cookie)
  return new NextRequest(`https://shop.test${path}`, { headers: all })
}

/** The marker the proxy hands to the rendering request (null: none). */
const kindOf = (res: Response) => res.headers.get('x-middleware-request-x-ff-route-kind')

beforeEach(() => {
  stubEnv()
  knownSources.mockResolvedValue(new Set([`/order/pay/${TOKEN}`, '/festival']))
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

describe('the route kind', () => {
  it.each([
    `/order/pay/${TOKEN}/`,
    '/payment/callback/?payment=3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77',
    // Scrubbed (the page keeps the uuid in this tab and may show it): still no operator code.
    '/payment/callback/?result=failed&code=gateway_rejected',
    `/login/?next=/order/pay/${TOKEN}/`,
  ])('marks %s as a credential page', async (path) => {
    const { proxy } = await load()
    expect(kindOf(await proxy(request(path)))).toBe('credential')
  })

  it.each(['/', '/product/x/', '/checkout/', '/login/?next=/account/'])(
    'marks %s as a page',
    async (path) => {
      resolveRedirect.mockResolvedValue(null)
      const { proxy } = await load()
      expect(kindOf(await proxy(request(path)))).toBe('page')
    },
  )

  it('never takes the visitor’s own marker', async () => {
    const { proxy } = await load()
    const forged = { 'x-ff-route-kind': 'page' }
    expect(kindOf(await proxy(request(`/order/pay/${TOKEN}/`, forged)))).toBe('credential')
  })

  it('marks the page on a session refresh too', async () => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    const res = await proxy(request(`/order/pay/${TOKEN}/`, {}, `ff_rt=${jwtExpiringIn(86_400)}`))
    expect(refreshAccess).toHaveBeenCalled()
    expect(kindOf(res)).toBe('credential')
    expect(res.headers.get('x-middleware-request-cookie')).toContain('ff_at=')
  })

  it('never looks a payment page up as a redirect source', async () => {
    const { proxy } = await load()
    const res = await proxy(request(`/order/pay/${TOKEN}/`))
    expect(knownSources).not.toHaveBeenCalled()
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  // A prefetched document can be kept and shown on the click (a browser's `Purpose: prefetch`,
  // an operator's instant.page), and the router may prefetch a page's segments: each is marked
  // like the visit, so a normal page keeps its operator code and a payment page never gets it.
  // Nothing else runs for a prefetch: no redirect lookup, no session refresh.
  it.each<[string, Record<string, string>]>([
    ['a browser prefetch', { purpose: 'prefetch' }],
    ['a router prefetch', { rsc: '1', 'next-router-prefetch': '1' }],
  ])('marks %s like the visit, and does nothing else', async (_, headers) => {
    refreshAccess.mockResolvedValue({ access: jwtExpiringIn(900) })
    const { proxy } = await load()
    const cookie = `ff_rt=${jwtExpiringIn(86_400)}`
    const page = await proxy(request('/festival/', headers, cookie))
    expect(kindOf(page)).toBe('page')
    expect(page.headers.get('location')).toBeNull()
    expect(kindOf(await proxy(request(`/order/pay/${TOKEN}/`, headers, cookie)))).toBe('credential')
    expect(kindOf(await proxy(request('/', { ...headers, 'x-ff-route-kind': 'credential' })))).toBe(
      'page',
    )
    expect(knownSources).not.toHaveBeenCalled()
    expect(resolveRedirect).not.toHaveBeenCalled()
    expect(refreshAccess).not.toHaveBeenCalled()
  })

  // A path the proxy leaves alone still renders a page there (an asset-like URL under a catalog
  // prefix: the 404 page, with the layouts' snippet gate). It is never marked, and a visitor's
  // own marker is dropped on the way: "unmarked = no operator code" holds literally.
  it('drops a visitor’s own marker on a path it leaves alone', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/product/photo.png', { 'x-ff-route-kind': 'page' }))
    expect(kindOf(res)).toBeNull()
    const kept = res.headers.get('x-middleware-override-headers')?.split(',') ?? []
    expect(kept).toContain('host')
    expect(kept).not.toContain('x-ff-route-kind')
    expect(knownSources).not.toHaveBeenCalled()
  })

  it('touches no request header of a path it leaves alone otherwise', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/product/photo.png'))
    expect(res.headers.get('x-middleware-override-headers')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
