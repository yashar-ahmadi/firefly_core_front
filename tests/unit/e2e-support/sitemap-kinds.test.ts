import { describe, expect, it } from 'vitest'
import { SITEMAP_KINDS, sitemapKind, unroutedSitemapPaths } from '../../e2e/support/sitemap-kinds'

// The sitemap's URL kinds (tests/e2e/seo-urls.spec.ts): every <loc> the backend lists must be one
// the shop routes. A kind the backend starts to list that no route answers must fail the spec.

describe('sitemapKind', () => {
  it.each([
    ['/product/samsung-galaxy-s25-ultra/', 'product'],
    ['/product-category/digital/', 'category'],
    ['/product-category/digital/mobile-phone/', 'category'],
    ['/brand/samsung/', 'brand'],
    ['/product/list/flagship-phones/', 'list'],
    ['/blog/category/buying-guide/', 'blog category'],
    ['/blog/category/buying-guide/appliance-blog/', 'blog category'],
    ['/page/about-us/', 'page'],
    ['/page/contact-us/', 'contact page'],
    ['/blog/best-phones-under-30m/', 'post'],
  ])('%s is a %s', (path, kind) => {
    expect(sitemapKind(path)).toBe(kind)
  })

  it.each([
    '/product/list/', // the generic list is noindex, never a sitemap URL
    '/product/a/b/',
    '/brand/',
    '/brand/samsung/phones/',
    '/blog/',
    '/blog/2026/10/a-post/',
    '/blog/category/',
    '/page/',
    '/page/a/b/',
    '/tag/phones/',
    '/shop/samsung/',
    '/product/no-slash',
    '/',
  ])('%s is no routed kind', (path) => {
    expect(sitemapKind(path)).toBeUndefined()
  })

  it('names the unrouted paths of a list, in order', () => {
    expect(
      unroutedSitemapPaths(['/product/a/', '/tag/x/', '/brand/b/', '/videos/c/', '/page/d/']),
    ).toEqual(['/tag/x/', '/videos/c/'])
  })

  it('every kind but the post and the contact page is sampled with a 200', () => {
    expect(SITEMAP_KINDS.filter((kind) => kind.sample).map((kind) => kind.name)).toEqual([
      'product',
      'category',
      'brand',
      'list',
      'blog category',
      'page',
    ])
  })
})
