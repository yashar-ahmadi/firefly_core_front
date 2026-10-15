import { expect, test, type APIResponse } from '@playwright/test'

// Edge behaviour against the dev backend (sample data): proxy redirects and forwards, robots.txt,
// short links and the bank callback. Raw HTTP, no browser: every redirect is observed, not followed.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'

function locationOf(res: APIResponse): URL {
  const location = res.headers()['location']
  expect(location, 'Location header').toBeTruthy()
  return new URL(location ?? '', 'http://storefront.invalid')
}

test.describe('edge', () => {
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
})
