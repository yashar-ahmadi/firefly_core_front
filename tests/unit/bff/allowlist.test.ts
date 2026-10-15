import { describe, expect, it } from 'vitest'
import { isAllowed } from '@/lib/bff/allowlist'

const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

describe('isAllowed (brief cases)', () => {
  it('blocks the staff-only feature toggles', () => {
    expect(isAllowed('GET', 'global/feature-toggles')).toBe(false)
  })

  it('blocks the bank callback (proxy.ts forwards it, not the BFF)', () => {
    expect(isAllowed('POST', 'payment/gateway/callback/zarinpal/x')).toBe(false)
  })

  it('allows adding to the cart', () => {
    expect(isAllowed('POST', 'cart/item/add')).toBe(true)
  })
})

describe('isAllowed: read and write prefixes', () => {
  const prefixes = [
    'account/profile/me/',
    'account/auth/login/',
    'cart/',
    'cart/merge/',
    'order/create/',
    'payment/start/',
    'wallet/charge/',
    'product/detail/x/',
    'blog/post/x/comment/',
    'pages/about/',
    'dashboard/summary/',
    'notification/list/',
    'devices/unregister/',
    'contact-us/message/submit/',
    'search/suggest/',
    'transportation/province/',
    'faq/list/',
  ]

  it.each(prefixes)('allows GET and every write on %s', (path) => {
    expect(isAllowed('GET', path)).toBe(true)
    for (const method of WRITES) expect(isAllowed(method, path), `${method} ${path}`).toBe(true)
  })

  it('matches methods case-insensitively and ignores extra slashes', () => {
    expect(isAllowed('post', '/cart//item/add/')).toBe(true)
  })

  it('allows the bare root, which is itself an endpoint for cart/ and search/', () => {
    expect(isAllowed('GET', 'cart')).toBe(true)
    expect(isAllowed('GET', 'search/')).toBe(true)
  })
})

describe('isAllowed: read-only paths', () => {
  it.each([
    'homepage/',
    'menu/main/',
    'linker/',
    'global/settings/',
    'global/feature-status/blog/',
  ])('allows GET %s but no write', (path) => {
    expect(isAllowed('GET', path)).toBe(true)
    for (const method of WRITES) expect(isAllowed(method, path), `${method} ${path}`).toBe(false)
  })

  it('matches homepage/ and linker/ exactly', () => {
    expect(isAllowed('GET', 'homepage/extra/')).toBe(false)
    expect(isAllowed('GET', 'linker/extra/')).toBe(false)
  })

  it('blocks the whole feature-toggles subtree and the whole callback subtree', () => {
    expect(isAllowed('GET', 'global/feature-toggles/1/')).toBe(false)
    expect(isAllowed('GET', 'payment/gateway/callback/')).toBe(false)
    expect(isAllowed('GET', 'payment/gateway/callback/zarinpal/tok/')).toBe(false)
    expect(isAllowed('GET', 'payment/gateway/list/')).toBe(true)
  })
})

describe('isAllowed: everything else is refused', () => {
  it.each([
    'redirects/resolve/',
    'shortener/abc/',
    'robots/',
    'schema/',
    'docs/',
    'secureAccessPanel/',
    'sitemap.xml',
    '',
    '/',
    'Cart/',
    'cartx/',
    'homepagex/',
  ])('refuses %j', (path) => {
    expect(isAllowed('GET', path)).toBe(false)
    expect(isAllowed('POST', path)).toBe(false)
  })

  it('refuses methods other than GET, POST, PUT, PATCH and DELETE', () => {
    for (const method of ['HEAD', 'OPTIONS', 'TRACE', 'CONNECT', ''])
      expect(isAllowed(method, 'cart/'), method).toBe(false)
  })

  it('refuses a segment hiding a slash, a backslash or a second encoding layer', () => {
    // A proxy in front of the API that decodes %2F and normalises would climb out of the prefix.
    for (const path of [
      'cart/..%2Frobots/',
      'cart/..%2frobots/',
      'cart/a%2Fb/',
      'cart/..%5Crobots/',
      'cart/%252e%252e/',
      'cart/%25/',
    ])
      expect(isAllowed('GET', path), path).toBe(false)
  })

  it('refuses dot segments, raw or encoded, anywhere in the path', () => {
    for (const path of [
      'cart/../redirects/resolve/',
      'cart/./item/',
      'cart/%2e%2e/robots/',
      'cart/%2E/',
      'product/..',
    ])
      expect(isAllowed('GET', path), path).toBe(false)
  })
})
