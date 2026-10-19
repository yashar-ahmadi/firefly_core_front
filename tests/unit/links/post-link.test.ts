import { describe, expect, it } from 'vitest'
import { blogPostPath, isBlogPostPath } from '@/lib/links/post-link'

// A post's page counts a view on every render (blog digest §1.5, ruling P5-R1): a link to one is
// never prefetched. `isBlogPostPath` tells a post's URL from the blog's other pages.

describe('blogPostPath', () => {
  it('is /blog/<slug>/ with the slug encoded once', () => {
    expect(blogPostPath('best-phones-under-30m')).toBe('/blog/best-phones-under-30m/')
    expect(blogPostPath('گوشی')).toBe(`/blog/${encodeURIComponent('گوشی')}/`)
  })
})

describe('isBlogPostPath', () => {
  it.each([
    '/blog/best-phones-under-30m/',
    '/blog/best-phones-under-30m',
    '/blog/best-phones-under-30m/?utm_source=menu',
    '/blog/best-phones-under-30m/#comments',
    `/blog/${encodeURIComponent('گوشی')}/`,
    '/blog/گوشی/',
    // Routed to the post page (a category needs a path after it).
    '/blog/category/',
  ])('%s is a post', (href) => {
    expect(isBlogPostPath(href)).toBe(true)
  })

  it.each([
    '/blog/',
    '/blog',
    '/blog/?page=2',
    '/blog/?search=گوشی',
    '/blog/category/tech-news/',
    '/blog/category/tech-news/mobile-blog/',
    '/blog/a/b/',
    '/blogger/x/',
    '/page/blog/',
    '/product/x/',
    'https://shop.ir/blog/x/',
    '//blog/x/',
    'blog/x/',
  ])('%s is not', (href) => {
    expect(isBlogPostPath(href)).toBe(false)
  })
})
