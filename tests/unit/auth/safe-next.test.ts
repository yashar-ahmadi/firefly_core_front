import { describe, expect, it } from 'vitest'
import { safeNext } from '@/features/auth/safe-next'

// Review Focus #3: `/login/?next=…` must never send a visitor to another site, nor back to an
// auth page (a loop). Everything that is not a plain path on this site falls back.

describe('safeNext', () => {
  it.each([
    ['/cart/', '/cart/'],
    ['/', '/'],
    ['/account/orders/?group=current', '/account/orders/?group=current'],
    ['/product/samsung-galaxy-s25-ultra/#reviews', '/product/samsung-galaxy-s25-ultra/#reviews'],
    // A Persian slug and query arrive percent-encoded, as loginHref writes them.
    ['/product-category/%DA%AF%D9%88%D8%B4%DB%8C/', '/product-category/%DA%AF%D9%88%D8%B4%DB%8C/'],
    ['/search/?q=%DA%AF%D9%88%D8%B4%DB%8C%20a%2Fb', '/search/?q=%DA%AF%D9%88%D8%B4%DB%8C%20a%2Fb'],
    // An encoded slash in the query cannot change the host.
    ['/product/list/?search=a%2F%2Fb', '/product/list/?search=a%2F%2Fb'],
  ])('keeps the same-site path %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected)
  })

  it('returns the path in its normal form (dot segments resolved)', () => {
    expect(safeNext('/product/../cart/')).toBe('/cart/')
    expect(safeNext('/./account/')).toBe('/account/')
  })

  it.each([
    // Other sites, with or without a scheme.
    'https://evil.com',
    'http://evil.com/account/',
    'http:evil.com',
    'evil.com',
    'evil.com/account/',
    // Protocol-relative, however the slashes are spelled.
    '//evil.com',
    '///evil.com',
    '//evil.com/account/',
    '/\\evil',
    '/\\/evil.com',
    '\\\\evil.com',
    '\\/evil.com',
    '/a\\b',
    // Encoded slashes and backslashes in the path, and a second encoding layer.
    '/%2F%2Fevil.com',
    '/%2f%2fevil.com',
    '/%2Fevil.com',
    '/%5Cevil',
    '/%5cevil.com',
    '/%252F%252Fevil.com',
    '/%25%32%46evil.com',
    // A dot segment that leaves `//` behind once resolved.
    '/..//evil.com',
    '/a/..//evil.com',
    // Controls and spaces: the URL parser drops tabs and newlines anywhere and trims spaces.
    ' //evil.com',
    '\t//evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    '/\u{0000}/evil.com',
    '/\u{007F}evil',
    '/cart/ ',
    '/\u{2028}/evil.com',
    // A double slash anywhere in the path.
    '/account//evil.com',
    // Scripts and other schemes.
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:a@b.co',
  ])('falls back for the hostile %j', (next) => {
    expect(safeNext(next)).toBe('/account/')
  })

  it.each([
    '/login/',
    '/login',
    '/login/?next=/account/',
    '/login/#x',
    '/register/',
    '/register/?method=email',
    '/forgot-password/',
    '/forgot-password',
    '/./login/',
    '/account/../login/',
    '/%6Cogin/',
    '/%6c%6f%67%69%6e/',
  ])('falls back for the auth page %j, so login never loops', (next) => {
    expect(safeNext(next)).toBe('/account/')
  })

  it('keeps a path that only starts like an auth page', () => {
    expect(safeNext('/login-help/')).toBe('/login-help/')
    expect(safeNext('/page/register-terms/')).toBe('/page/register-terms/')
  })

  it('falls back for nothing at all, and uses the fallback given', () => {
    expect(safeNext(null)).toBe('/account/')
    expect(safeNext(undefined)).toBe('/account/')
    expect(safeNext('')).toBe('/account/')
    expect(safeNext('//evil.com', '/')).toBe('/')
    expect(safeNext(undefined, '/cart/')).toBe('/cart/')
  })
})
