import { describe, expect, it } from 'vitest'
import { asParsed, isRootPath } from '@/lib/links/as-parsed'

// An operator's URL as the browser's URL parser reads it (WHATWG URL): leading and trailing C0
// controls and spaces ignored, tabs and line breaks dropped anywhere, `\` read as `/` in an http(s)
// URL. So `/<tab>/host`, `/<newline>/host`, `/\host` and `\u{1}//host` all lead to another host.

describe('asParsed', () => {
  it('drops what the parser drops: edge C0 controls and spaces, tabs and line breaks', () => {
    expect(asParsed('\u{1}\u{1F} //evil.example/ \u{0}')).toBe('//evil.example/')
    expect(asParsed('/\t/evil.example/')).toBe('//evil.example/')
    expect(asParsed('/\r\n/evil.example/')).toBe('//evil.example/')
    expect(asParsed('/pro\tduct/list/x/')).toBe('/product/list/x/')
  })
})

describe('isRootPath', () => {
  it.each(['/contact-us/', '/product/list/x/', '/pro\tduct/', ' /faq/ ', '/'])(
    'a store path: %j',
    (value) => expect(isRootPath(value)).toBe(true),
  )

  it.each([
    '//evil.example/',
    '/\\evil.example/',
    '/\t/evil.example/',
    '/\n/evil.example/',
    '/\t\\evil.example/',
    '\u{1}//evil.example/',
    '\u{0}\u{1F}/\t/evil.example/',
    'https://evil.example/',
    'javascript:alert(1)',
    '',
  ])('never a store path: %j', (value) => expect(isRootPath(value)).toBe(false))
})
