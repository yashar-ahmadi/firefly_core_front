// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return (await import('@/proxy')).config
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('matcher', () => {
  const matches = async (url: string, headers: Record<string, string> = {}) => {
    const config = await loadConfig()
    return unstable_doesMiddlewareMatch({ config, url, headers })
  }

  it.each([
    '/',
    '/product/samsung-galaxy-s23-ultra/',
    '/festival/',
    '/blog/%DA%A9/',
    '/product/v1.5/',
    '/sitemap.xml',
    '/media/categories/26/09/13/site-logo.png',
    '/static/defaults/default.png',
    '/old-page.html',
    '/catalog/item.htm',
    '/product.php?id=7',
    '/default.asp',
    '/shop/list.aspx',
    '/healthz-tips/',
    // Undecodable: the proxy answers 404 itself.
    '/product-category/abc%ZZ/',
    '/product-category/digital/%E0%A4%A/',
  ])('runs on %s', async (url) => {
    expect(await matches(url)).toBe(true)
  })

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image?url=x',
    '/api/bff/cart/',
    '/api/v1/payment/gateway/callback/zarinpal/abc/',
    '/s/phone-fest/',
    '/robots.txt',
    '/healthz',
    '/healthz/',
    '/favicon.ico',
    '/icons/icon-192.png',
    '/logo.svg',
    '/app.js',
    '/style.css',
    '/manifest.webmanifest',
  ])('skips %s', async (url) => {
    expect(await matches(url)).toBe(false)
  })

  it.each<Record<string, string>>([{ 'next-router-prefetch': '1' }, { purpose: 'prefetch' }])(
    'skips page prefetches (%o)',
    async (headers) => {
      expect(await matches('/festival/', headers)).toBe(false)
    },
  )
})
