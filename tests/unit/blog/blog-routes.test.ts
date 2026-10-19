import { describe, expect, it } from 'vitest'
import {
  blogCategoryPath,
  blogListingHref,
  blogPostPath,
  blogSearchHref,
  parseBlogQuery,
} from '@/features/blog/blog-routes'

// The blog's URLs (blog digest §1.10, the same as `subject-links.ts`) and its archive query:
// `?page=` and `?search=`, the post list's own names. Anything else falls back to the defaults.

describe('blog URLs', () => {
  it('a post is /blog/<slug>/, a category /blog/category/<path>/, each segment encoded once', () => {
    expect(blogPostPath('best-phones-under-30m')).toBe('/blog/best-phones-under-30m/')
    expect(blogPostPath('گوشی')).toBe('/blog/%DA%AF%D9%88%D8%B4%DB%8C/')
    expect(blogCategoryPath('tech-news/mobile-blog')).toBe('/blog/category/tech-news/mobile-blog/')
    expect(blogCategoryPath('اخبار/گوشی')).toBe(
      `/blog/category/${encodeURIComponent('اخبار')}/${encodeURIComponent('گوشی')}/`,
    )
  })

  it('a listing href keeps search before page and leaves the defaults out', () => {
    expect(blogListingHref('/blog/', {})).toBe('/blog/')
    expect(blogListingHref('/blog/', { page: 1 })).toBe('/blog/')
    expect(blogListingHref('/blog/', { page: 2, search: 'گوشی' })).toBe(
      `/blog/?search=${encodeURIComponent('گوشی')}&page=2`,
    )
    expect(blogListingHref('/blog/category/tutorial/', { page: 3 })).toBe(
      '/blog/category/tutorial/?page=3',
    )
    expect(blogSearchHref('ای')).toBe(`/blog/?search=${encodeURIComponent('ای')}`)
  })
})

describe('parseBlogQuery', () => {
  it('reads a later page and a search term', () => {
    expect(parseBlogQuery({ page: '2', search: ' گوشی ' })).toEqual({ page: 2, search: 'گوشی' })
    expect(parseBlogQuery({ page: '۳' })).toEqual({ page: 3 })
  })

  it.each([
    [{}, {}],
    [{ page: '1' }, {}],
    [{ page: '0' }, {}],
    [{ page: '-2' }, {}],
    [{ page: '1.5' }, {}],
    [{ page: 'abc' }, {}],
    [{ page: '' }, {}],
    [{ page: ['2', '5'] }, { page: 2 }],
    [{ search: '   ' }, {}],
    [{ search: 'a\u{0}b' }, {}],
    [{ sort: 'name', limit: '100', category: 'x', ordering: '-view_count' }, {}],
  ])('%j falls back to %j', (sp, expected) => {
    expect(parseBlogQuery(sp)).toEqual(expected)
  })

  it('cuts a very long search to 200 characters', () => {
    expect(parseBlogQuery({ search: 'ب'.repeat(300) }).search).toHaveLength(200)
  })
})
