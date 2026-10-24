import { describe, expect, it } from 'vitest'
import { isStorePath, storeHref } from '@/lib/links/store-href'

describe('storeHref', () => {
  it('keeps paths and foreign URLs as they are', () => {
    expect(storeHref('/product/x/', 'https://shop.ir/')).toBe('/product/x/')
    expect(storeHref('https://blog.example.com/a/', 'https://shop.ir/')).toBe(
      'https://blog.example.com/a/',
    )
  })

  it('strips the shop own origin so the link routes on the client', () => {
    expect(storeHref('https://shop.ir/product/list/?a=1#top', 'https://shop.ir/')).toBe(
      '/product/list/?a=1#top',
    )
    expect(storeHref('https://shop.ir', 'https://shop.ir/')).toBe('/')
    expect(storeHref('http://shop.ir/x/', 'https://shop.ir/')).toBe('http://shop.ir/x/')
  })

  // As the browser reads it (as-parsed.ts): what the link checks, renders and routes to agree.
  it('gives the URL as the browser reads it: edge controls and spaces, tabs and line breaks gone', () => {
    expect(storeHref(' /s/phone-fest/\n', 'https://shop.ir/')).toBe('/s/phone-fest/')
    expect(storeHref('/\t/evil.example/', 'https://shop.ir/')).toBe('//evil.example/')
    expect(storeHref('\u{1}https://shop.ir/pro\tduct/x/', 'https://shop.ir/')).toBe('/product/x/')
    expect(storeHref('\u{1}https://blog.example.com/a/', undefined)).toBe(
      'https://blog.example.com/a/',
    )
  })

  it('leaves a URL alone when the site URL is unknown or invalid', () => {
    expect(storeHref('https://shop.ir/x/', undefined)).toBe('https://shop.ir/x/')
    expect(storeHref('https://shop.ir/x/', 'not a url')).toBe('https://shop.ir/x/')
  })
})

describe('isStorePath', () => {
  it('accepts root-relative paths only', () => {
    expect(isStorePath('/')).toBe(true)
    expect(isStorePath('/product/x/?a=1#b')).toBe(true)
    expect(isStorePath('//evil.example/')).toBe(false)
    expect(isStorePath('/\\evil.example/')).toBe(false)
    expect(isStorePath('https://shop.ir/')).toBe(false)
    expect(isStorePath('#top')).toBe(false)
    expect(isStorePath('product/x/')).toBe(false)
    expect(isStorePath('')).toBe(false)
  })
})

// Read as the browser's URL parser reads it (src/lib/links/as-parsed.ts, as the linker and
// safe-url do): leading and trailing C0 controls and spaces are ignored, tabs and line breaks are
// dropped anywhere, and `\` is `/`. So `/<tab>/host` is `//host`, another host: never a store path
// routed on the client.
describe('isStorePath reads the href as the browser does', () => {
  it.each([
    '/\t/evil.example/',
    '/\n/evil.example/',
    '/\r\n/evil.example/',
    '/\t\\evil.example/',
    '\\/evil.example/',
    '\u{1}//evil.example/',
    ' //evil.example/',
    '\u{0}\u{1f}/\\evil.example/',
  ])('never takes %j for a store path: it leads to another host', (href) => {
    expect(isStorePath(href)).toBe(false)
  })

  it.each([
    '/pro\tduct/x/',
    '/product/\nx/',
    '\u{1}/product/x/',
    ' /product/x/',
    '/product/x/\u{1f}',
  ])('takes %j for the storefront path it is', (href) => expect(isStorePath(href)).toBe(true))
})
