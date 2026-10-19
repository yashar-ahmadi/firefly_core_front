// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOfflineCopyRequest } from '@/lib/edge/offline-copy'
import { stubEnv } from '../bff/support'

// The service worker keeps no page the server sent `private, no-store` (every page: the root
// layout is dynamic). It asks for the offline pages' copies itself (src/features/pwa/sw-offline.ts:
// `x-ff-offline: snapshot`, `credentials: 'omit'`), and the proxy answers such a request, and only
// such a request, with `Cache-Control: no-cache` and the header back: the server's consent. A
// request with any cookie (a session, a guest cart, anything) or `Authorization` never gets it,
// nor does any page but the offline page and the home page.

const resolveRedirect = vi.fn()

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/edge/redirects', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/edge/redirects')>()),
    knownSources: async () => new Set<string>(),
    resolveRedirect,
  }))
  return import('@/proxy')
}

const COPY = { 'x-ff-offline': 'snapshot' }

function request(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(`https://shop.test${path}`, {
    method,
    headers: { host: 'shop.test', ...headers },
  })
}

beforeEach(() => {
  stubEnv()
  resolveRedirect.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
  vi.doUnmock('@/lib/edge/redirects')
})

describe('isOfflineCopyRequest', () => {
  it.each(['/', '/offline/', '/?source=pwa'])('the worker’s request for %s', (path) => {
    expect(isOfflineCopyRequest(request(path, COPY))).toBe(true)
  })

  it.each([
    ['a session cookie', '/', { ...COPY, cookie: 'ff_rt=r; ff_at=a; ff_auth=1' }],
    ['a guest cart cookie', '/', { ...COPY, cookie: 'ff_cart=t' }],
    ['any cookie at all', '/', { ...COPY, cookie: '_ga=GA1.1' }],
    ['Authorization', '/', { ...COPY, authorization: 'Bearer x' }],
    ['no header', '/', {}],
    ['another value', '/', { 'x-ff-offline': '1' }],
    ['a router fetch', '/', { ...COPY, rsc: '1' }],
    ['another page', '/product/x/', COPY],
    ['the cart', '/cart/', COPY],
    ['an account page', '/account/', COPY],
    ['the checkout', '/checkout/', COPY],
    ['a payment page', '/payment/callback/', COPY],
  ])('never with %s', (_, path, headers) => {
    expect(isOfflineCopyRequest(request(path, headers))).toBe(false)
  })

  it('never for a HEAD or a POST', () => {
    expect(isOfflineCopyRequest(request('/', COPY, 'HEAD'))).toBe(false)
    expect(isOfflineCopyRequest(request('/', COPY, 'POST'))).toBe(false)
  })
})

describe('the proxy’s answer', () => {
  it('the worker’s request for the home page: rendered with the consent to keep it', async () => {
    const { proxy } = await load()
    const res = await proxy(request('/', COPY))
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(res.headers.get('x-ff-offline')).toBe('snapshot')
    // A shared cache in front may reuse this copy only for the worker's own request.
    expect(res.headers.get('vary')?.toLowerCase().split(/,\s*/)).toContain('x-ff-offline')
    // Still the page as rendered for anyone: marked for the layouts, like any page.
    expect(res.headers.get('x-middleware-request-x-ff-route-kind')).toBe('page')
  })

  it.each([
    ['the visitor’s own navigation', '/', { cookie: 'ff_rt=r; ff_auth=1' }],
    ['the header with a cookie', '/', { ...COPY, cookie: 'ff_cart=t' }],
    ['the header on another page', '/product/x/', COPY],
    ['a page without it', '/', {}],
  ])('%s: no consent (Next’s private, no-store stands)', async (_, path, headers) => {
    const { proxy } = await load()
    const res = await proxy(request(path, headers))
    expect(res.headers.get('cache-control')).toBeNull()
    expect(res.headers.get('x-ff-offline')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
  })
})
