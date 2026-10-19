// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { blogHomeMetadata } from '@/features/blog/blog-seo'
import { parseBlogQuery } from '@/features/blog/blog-routes'
import { parseListingParams, toSearchParams } from '@/features/catalog/listing-params'
import { hasQuery, listingIndexing } from '@/features/catalog/listing-routes'
import { calls, envelope } from '../bff/support'
import { API, loadCatalog, mockCatalogApi } from './support'

// Tracking parameters on listing URLs (Plan 5 Task 7, seo digest §10 and §13 «normalized query
// strings»): `utm_*`, `gclid`, `fbclid`, `msclkid`, `yclid`, `_ga`… are never filters. The API
// query (and so the Data Cache key) never carries them, the canonical leaves them out, and a
// listing with nothing else is indexed as its clean URL.

const TRACKING = {
  utm_source: 'newsletter',
  utm_medium: 'email',
  utm_campaign: 'fall',
  gclid: 'g',
  fbclid: 'f',
  msclkid: 'm',
  yclid: 'y',
  _ga: '1.2.3',
}
const path = '/product-category/digital/mobile-phone/'

describe('filters: the API query', () => {
  it('never carries a tracking parameter', () => {
    const query = parseListingParams({ ...TRACKING, page: '2', in_stock: 'true' })
    expect(query).toEqual({ page: 2, in_stock: true })
    expect(toSearchParams(query).toString()).toBe('in_stock=true&page=2')
    expect(parseBlogQuery({ ...TRACKING, page: '3' })).toEqual({ page: 3 })
  })
})

describe('the cache key', () => {
  const mocks = mockCatalogApi()

  it('a listing with tracking parameters reads the very URL the clean one reads', async () => {
    mocks.fetch.mockImplementation(async () =>
      envelope({
        count: 0,
        total_pages: 1,
        current_page: 1,
        next: null,
        previous: null,
        results: [],
      }),
    )
    const { getProductList } = await loadCatalog()
    await getProductList(
      parseListingParams({ ...TRACKING, page: '2' }, { context: { category: 'mobile-phone' } }),
    )
    await getProductList(
      parseListingParams({ page: '2' }, { context: { category: 'mobile-phone' } }),
    )
    const urls = calls(mocks.fetch).map((call) => call.url)
    expect(urls[0]).toBe(`${API}product/list/?category=mobile-phone&page=2`)
    expect(new Set(urls).size).toBe(1)
  })
})

describe('canonical and robots', () => {
  it('only tracking parameters: indexable, the clean canonical (the operator link when set)', () => {
    expect(listingIndexing(TRACKING, { path })).toEqual({ canonical: path, noindex: false })
    expect(listingIndexing(TRACKING, { path, canonicalLink: 'https://shop.ir/x/' })).toEqual({
      canonical: 'https://shop.ir/x/',
      noindex: false,
    })
  })

  it('a later page with tracking parameters: its own canonical, without them', () => {
    expect(listingIndexing({ ...TRACKING, page: '2' }, { path })).toEqual({
      canonical: `${path}?page=2`,
      noindex: false,
      page: 2,
    })
  })

  it('a real filter beside them is still another page: noindex, no canonical', () => {
    expect(listingIndexing({ ...TRACKING, sort: 'price-asc' }, { path })).toEqual({
      noindex: true,
      noCanonical: true,
    })
  })

  it('hasQuery (the generic listing, the search page) does not count them', () => {
    expect(hasQuery(TRACKING)).toBe(false)
    expect(hasQuery({ ...TRACKING, has_discount: 'true' })).toBe(true)
  })

  it('the blog home: its canonical, indexable', () => {
    const metadata = blogHomeMetadata(TRACKING, {}, 'فایرفلای')
    expect(metadata.alternates?.canonical).toBe('/blog/')
    expect(metadata.robots).toBeUndefined()
  })
})
