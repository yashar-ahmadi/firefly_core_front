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
