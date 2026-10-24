import { describe, expect, it } from 'vitest'
import { mapLink } from '@/components/layout/contact-block'
import { httpUrl, linkUrl } from '@/lib/html/safe-url'

describe('httpUrl / linkUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(httpUrl(' https://t.me/shop ')).toBe('https://t.me/shop')
    expect(httpUrl('http://localhost:8000/x')).toBe('http://localhost:8000/x')
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      '/page/x/',
      'https://',
      '',
      null,
      undefined,
    ]) {
      expect(httpUrl(bad), String(bad)).toBeNull()
    }
  })

  it('also accepts storefront paths, never protocol-relative ones', () => {
    expect(linkUrl('/contact-us/')).toBe('/contact-us/')
    expect(linkUrl('https://shop.ir/contact/')).toBe('https://shop.ir/contact/')
    expect(linkUrl('//evil.example/')).toBeNull()
    expect(linkUrl('/\\evil.example/')).toBeNull()
    expect(linkUrl('javascript:alert(1)')).toBeNull()
  })

  // The URL parser drops tabs and line breaks and ignores leading C0 controls: each of these is
  // `//evil.example/`, another host (src/lib/links/as-parsed.ts).
  it.each(['/\t/evil.example/', '/\n/evil.example/', '/\t\\evil.example/', '\u{1}//evil.example/'])(
    'never takes %j for a storefront path',
    (value) => expect(linkUrl(value)).toBeNull(),
  )

  it('gives a storefront path as the parser reads it', () => {
    expect(linkUrl('\u{1}/contact-us/')).toBe('/contact-us/')
    expect(linkUrl('/con\ttact-us/')).toBe('/contact-us/')
  })
})

describe('mapLink', () => {
  it('uses a plain URL or the src of a Google Maps iframe', () => {
    expect(mapLink('https://maps.google.com/?q=35.7,51.4')).toBe(
      'https://maps.google.com/?q=35.7,51.4',
    )
    expect(
      mapLink(
        '<iframe src="https://www.google.com/maps/embed?pb=1&amp;z=2" width="600" height="450"></iframe>',
      ),
    ).toBe('https://www.google.com/maps/embed?pb=1&z=2')
  })

  it('ignores anything that is not an http(s) URL', () => {
    expect(mapLink('<iframe src="javascript:alert(1)"></iframe>')).toBeNull()
    expect(mapLink('تهران، میدان ونک')).toBeNull()
    expect(mapLink(null)).toBeNull()
  })
})
