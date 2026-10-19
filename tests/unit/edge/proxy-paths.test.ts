import { describe, expect, it } from 'vitest'
import { isSkipped } from '@/lib/edge/proxy-paths'

// The proxy leaves asset files alone, but not `.xml` nor the legacy page extensions operators
// redirect from (`.html`, `.htm`, `.php`, `.asp`, `.aspx`), in any letter case: old platforms
// and printed links spell them `/Index.PHP` or `/OLD-PAGE.HTML` as often as not.

describe('isSkipped', () => {
  it.each([
    '/old-page.html',
    '/OLD-PAGE.HTML',
    '/catalog/Item.Htm',
    '/index.php',
    '/Index.PHP',
    '/default.asp',
    '/DEFAULT.ASP',
    '/shop/list.aspx',
    '/shop/List.AsPx',
    '/feed.xml',
    '/feed.XML',
  ])('runs the proxy on the page URL %s', (path) => {
    expect(isSkipped(path, true)).toBe(false)
  })

  it.each(['/logo.svg', '/logo.SVG', '/app.js', '/App.JS', '/style.CSS', '/photo.JPG'])(
    'leaves the asset file %s alone',
    (path) => {
      expect(isSkipped(path, true)).toBe(true)
    },
  )

  it('an undecodable catalog path is never an asset file, in any case', () => {
    expect(isSkipped('/product/x%ZZ.PNG', false)).toBe(false)
  })
})
