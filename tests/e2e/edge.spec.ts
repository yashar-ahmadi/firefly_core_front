import { expect, test, type APIResponse } from '@playwright/test'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param.js'
import { readFileSync } from 'node:fs'

// Edge behaviour against the dev backend (sample data): proxy redirects and forwards, robots.txt,
// the favicon, short links and the bank callback. Raw HTTP, no browser: every redirect is
// observed, not followed.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'

type Shape = { headers: Record<string, string> }
/** What the App Router really sends (captured; tests/unit/edge/proxy-rsc.test.ts reads it too). */
const shapes = JSON.parse(
  readFileSync(new URL('../fixtures/rsc-request-shapes.json', import.meta.url), 'utf8'),
) as { skipProxyUrlNormalize: { treePrefetch: Shape; navigation: Shape } }

function locationOf(res: APIResponse): URL {
  const location = res.headers()['location']
  expect(location, 'Location header').toBeTruthy()
  return new URL(location ?? '', 'http://storefront.invalid')
}

test.describe('edge', () => {
  // The API counts every redirect and short-link hit: run these checks in one project only.
  test.beforeAll(({}, workerInfo) => {
    test.skip(workerInfo.project.name !== 'desktop', 'edge checks run once (desktop project)')
  })

  test('a temporary redirect rule answers 302', async ({ request }) => {
    const res = await request.get('/festival/', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(locationOf(res).pathname).toBe('/product-category/digital/mobile-phone/')
  })

  test('a gone rule answers 410 with a Persian page', async ({ request }) => {
    const res = await request.get('/product/nokia-3310-classic/', { maxRedirects: 0 })
    expect(res.status()).toBe(410)
    expect(res.headers()['content-type']).toContain('text/html')
    expect(await res.text()).toContain('dir="rtl"')
  })

  test('a permanent redirect rule answers 301 and keeps the query', async ({ request }) => {
    const res = await request.get('/product/samsung-galaxy-s23-ultra/?utm_source=sms', {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(301)
    const target = locationOf(res)
    expect(target.pathname).toBe('/product/samsung-galaxy-s25-ultra/')
    expect(target.searchParams.get('utm_source')).toBe('sms')
  })

  test('robots.txt is the operator file as plain text', async ({ request }) => {
    const res = await request.get('/robots.txt', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/plain')
    expect(await res.text()).toContain('Sitemap:')
  })

  test('/favicon.ico is always an image: the shop’s favicon, or the bundled one', async ({
    request,
  }) => {
    // Browsers ask for it on their own (the dev favicon is a missing media file): never a 404.
    const res = await request.get('/favicon.ico', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/^image\//)
    expect(res.headers()['cache-control']).toMatch(/^public, max-age=\d+$/)
    expect((await res.body()).byteLength).toBeGreaterThan(0)
  })

  test('sitemap.xml is forwarded to the backend', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('xml')
    expect(await res.text()).toContain('<urlset')
  })

  test('a short link answers 302 to its target', async ({ request }) => {
    const res = await request.get('/s/phone-fest/', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toMatch(/\/product\/list\/flagship-phones\/$/)
  })

  test('a short-link prefetch is never redirected: 204 for the router, 503 for the browser', async ({
    request,
  }) => {
    const prefetches: [Record<string, string>, number][] = [
      [{ 'next-router-prefetch': '1' }, 204],
      [{ 'sec-purpose': 'prefetch' }, 503],
    ]
    for (const [headers, status] of prefetches) {
      const res = await request.get('/s/phone-fest/', { maxRedirects: 0, headers })
      expect(res.status()).toBe(status)
      expect(res.headers()['cache-control']).toBe('no-store')
      expect(res.headers()['location']).toBeUndefined()
    }
  })

  test('pages, route handlers and forwarded files carry the baseline security headers', async ({
    request,
  }) => {
    for (const path of ['/', '/robots.txt', '/healthz/', '/static/defaults/default.png']) {
      const headers = (await request.get(path, { maxRedirects: 0 })).headers()
      expect(headers['x-frame-options'], path).toBe('SAMEORIGIN')
      expect(headers['content-security-policy'], path).toBe("frame-ancestors 'self'")
      expect(headers['x-content-type-options'], path).toBe('nosniff')
    }
    const page = (await request.get('/', { maxRedirects: 0 })).headers()
    expect(page['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('an unknown short link answers 404 with a Persian page', async ({ request }) => {
    const res = await request.get('/s/nope-404/', { maxRedirects: 0 })
    expect(res.status()).toBe(404)
    expect(res.headers()['content-type']).toContain('text/html')
    expect(await res.text()).toContain('لینک')
  })

  test('the bank callback is forwarded and its redirect relayed', async ({ request }) => {
    const res = await request.post('/api/v1/payment/gateway/callback/zarinpal/unknowntoken123/', {
      form: { Authority: 'A000', Status: 'NOK' },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toContain('result=failed')
  })

  test.describe('media', () => {
    let logoPath = ''

    test.beforeAll(async ({ request }) => {
      const settings = await request.get(`${API_URL}/api/v1/global/settings/`)
      expect(settings.ok()).toBe(true)
      const logo: unknown = (await settings.json()).data?.logo
      expect(typeof logo).toBe('string')
      logoPath = new URL(logo as string).pathname
      expect(logoPath).toMatch(/^\/media\//)
    })

    test('a /media/ URL answers exactly what the backend answers', async ({ request }) => {
      const direct = await request.get(`${API_URL}${logoPath}`, { maxRedirects: 0 })
      const res = await request.get(logoPath, { maxRedirects: 0 })
      expect(res.status()).toBe(direct.status())
      expect(res.headers()['content-type']).toBe(direct.headers()['content-type'])
      // Only Django sends X-Frame-Options here; Next's own 404 page would not carry it.
      expect(direct.headers()['x-frame-options']).toBeTruthy()
      expect(res.headers()['x-frame-options']).toBe(direct.headers()['x-frame-options'])
      expect((await res.body()).equals(await direct.body())).toBe(true)
    })

    test('the settings logo is served as an image', async ({ request }) => {
      const direct = await request.head(`${API_URL}${logoPath}`)
      // The dev sample data names media files that are not on the backend's disk.
      test.skip(!direct.ok(), `the backend itself has no file at ${logoPath}`)
      const res = await request.get(logoPath, { maxRedirects: 0 })
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toMatch(/^image\//)
    })
  })

  test('/static/ files are served through the storefront', async ({ request }) => {
    const res = await request.get('/static/defaults/default.png', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
  })

  // The App Router's own requests, as the browser sends them (tests/fixtures/rsc-request-
  // shapes.json), with Next's own `_rsc` hash so its check lets them through: a prefetch is
  // marked and nothing more (no account guard, no cookie touched, no redirect lookup); a client
  // navigation is guarded, its Location relative. A tab whose session ended elsewhere holds only
  // the flag cookie.
  test.describe('router prefetches and client navigations', () => {
    const LEFTOVER = { cookie: 'ff_auth=k3J9f0qLx2mN8pR1sT4u' }
    const { treePrefetch, navigation } = shapes.skipProxyUrlNormalize
    const treeHash = () =>
      computeCacheBustingSearchParam('1', '/_tree', undefined, treePrefetch.headers['next-url'])

    test('a router prefetch of an account page: no guard, no cookie touched', async ({
      request,
    }) => {
      const res = await request.get(`/account/?_rsc=${await treeHash()}`, {
        headers: { ...treePrefetch.headers, ...LEFTOVER },
        maxRedirects: 0,
      })
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('text/x-component')
      expect(res.headersArray().filter(({ name }) => name.toLowerCase() === 'set-cookie')).toEqual(
        [],
      )
    })

    test('a router prefetch of a redirect source: no redirect lookup', async ({ request }) => {
      const res = await request.get(`/festival/?_rsc=${await treeHash()}`, {
        headers: treePrefetch.headers,
        maxRedirects: 0,
      })
      expect(res.status()).not.toBe(302)
    })

    test('a client navigation to an account page: guarded, a relative Location', async ({
      request,
      baseURL,
    }) => {
      const headers = navigation.headers
      const rsc = await computeCacheBustingSearchParam(
        undefined,
        undefined,
        headers['next-router-state-tree'],
        headers['next-url'],
      )
      const res = await request.get(`/account/profile/?x=1&_rsc=${rsc}`, {
        headers: { ...headers, ...LEFTOVER },
        maxRedirects: 0,
      })
      expect(res.status()).toBe(307)
      const sent = res.headers()['location'] ?? ''
      expect(sent).toMatch(/^\/login\//)
      const location = new URL(sent, baseURL)
      expect(location.pathname).toBe('/login/')
      expect(location.searchParams.get('next')).toBe('/account/profile/?x=1')
      const cleared = res
        .headersArray()
        .filter(
          ({ name, value }) => name.toLowerCase() === 'set-cookie' && /^ff_auth=;/.test(value),
        )
      expect(cleared).toHaveLength(1)
    })
  })
})
