import { describe, expect, it } from 'vitest'
import {
  brandPath,
  categoryPath,
  genericListingTitle,
  listingIndexing,
  listPagePath,
  queryString,
  requestedCategoryPath,
} from '@/features/catalog/listing-routes'

const PERSIAN = 'دیجیتال'
const PERSIAN_ENCODED = encodeURIComponent(PERSIAN)

describe('listing paths', () => {
  it('builds each route path with its trailing slash, every segment encoded once', () => {
    expect(categoryPath('digital/mobile-phone')).toBe('/product-category/digital/mobile-phone/')
    expect(categoryPath(`${PERSIAN}/mobile`)).toBe(`/product-category/${PERSIAN_ENCODED}/mobile/`)
    expect(brandPath('samsung')).toBe('/brand/samsung/')
    expect(brandPath('سامسونگ')).toBe(`/brand/${encodeURIComponent('سامسونگ')}/`)
    expect(listPagePath('flagship-phones')).toBe('/product/list/flagship-phones/')
  })
})

describe('requestedCategoryPath', () => {
  it('decodes each segment, so an encoded and a decoded request compare equal', () => {
    expect(requestedCategoryPath(['digital', 'mobile-phone'])).toBe('digital/mobile-phone')
    expect(requestedCategoryPath([PERSIAN_ENCODED, 'mobile'])).toBe(`${PERSIAN}/mobile`)
    expect(requestedCategoryPath([PERSIAN, 'mobile'])).toBe(`${PERSIAN}/mobile`)
  })

  it('is null for a segment that cannot be a slug', () => {
    expect(requestedCategoryPath([])).toBeNull()
    expect(requestedCategoryPath(['%E0%A4%A'])).toBeNull()
    expect(requestedCategoryPath(['digital', 'a%2Fb'])).toBeNull()
    expect(requestedCategoryPath(['..'])).toBeNull()
    expect(requestedCategoryPath(['digital', ''])).toBeNull()
  })
})

describe('queryString', () => {
  it('rebuilds the query with repeated keys, or nothing', () => {
    expect(queryString({})).toBe('')
    expect(queryString({ brand: 'apple', page: undefined })).toBe('?brand=apple')
    expect(queryString({ a: ['1', '2'], b: 'x y' })).toBe('?a=1&a=2&b=x+y')
  })
})

describe('listingIndexing', () => {
  const path = '/brand/apple/'

  it('page 1 is indexable with the clean canonical (the operator link when set)', () => {
    expect(listingIndexing({}, { path })).toEqual({ canonical: path, noindex: false })
    expect(listingIndexing({ page: '1' }, { path, canonicalLink: 'https://shop.ir/x/' })).toEqual({
      canonical: 'https://shop.ir/x/',
      noindex: false,
    })
  })

  it('a later page stays indexable with a canonical of its own and its number', () => {
    expect(listingIndexing({ page: '3' }, { path, canonicalLink: 'https://shop.ir/x/' })).toEqual({
      canonical: '/brand/apple/?page=3',
      noindex: false,
      page: 3,
    })
    expect(listingIndexing({ page: '۲' }, { path })).toEqual({
      canonical: '/brand/apple/?page=2',
      noindex: false,
      page: 2,
    })
  })

  it('any other parameter but tracking is noindex, follow, with no canonical (not one to another URL)', () => {
    expect(listingIndexing({ brand: 'apple', page: '2' }, { path })).toEqual({
      noindex: true,
      noCanonical: true,
    })
    expect(listingIndexing({ foo: 'x' }, { path, canonicalLink: null })).toEqual({
      noindex: true,
      noCanonical: true,
    })
    // Tracking parameters are not filters (tracking-listing.test.ts).
    expect(listingIndexing({ utm_source: 'x' }, { path })).toEqual({
      canonical: path,
      noindex: false,
    })
    // An unreadable page is no page: the clean canonical.
    expect(listingIndexing({ page: 'abc' }, { path })).toEqual({ canonical: path, noindex: false })
  })
})

describe('genericListingTitle', () => {
  it('names the listing after what it filters, then how it is sorted', () => {
    expect(genericListingTitle({})).toBe('همهٔ محصولات')
    expect(genericListingTitle({ has_discount: true })).toBe('تخفیف‌ها')
    expect(genericListingTitle({ has_discount: false })).toBe('همهٔ محصولات')
    expect(genericListingTitle({ sort: 'sale' })).toBe('پرفروش‌ترین‌ها')
    expect(genericListingTitle({ sort: 'date-desc' })).toBe('جدیدترین‌ها')
    expect(genericListingTitle({ sort: 'price-asc' })).toBe('همهٔ محصولات')
    expect(genericListingTitle({ is_special: true })).toBe('پیشنهادهای ویژه')
    expect(genericListingTitle({ is_special: true, sort: 'date-desc' })).toBe('پیشنهادهای ویژه')
    expect(genericListingTitle({ has_discount: true, sort: 'sale' })).toBe('تخفیف‌ها')
    // The home carousel's «مشاهدهٔ همه» of timed discounts (`has_timed_discount=true&in_stock=true`).
    expect(genericListingTitle({ has_timed_discount: true, in_stock: true })).toBe(
      'پیشنهادهای شگفت‌انگیز',
    )
    expect(genericListingTitle({ has_timed_discount: true, has_discount: true })).toBe(
      'پیشنهادهای شگفت‌انگیز',
    )
    expect(genericListingTitle({ has_timed_discount: false })).toBe('همهٔ محصولات')
  })

  it("uses a curated list's name when the URL names one that exists", () => {
    expect(genericListingTitle({ list: 'flagship-phones', has_discount: true }, 'پرچمدارها')).toBe(
      'پرچمدارها',
    )
    expect(genericListingTitle({ list: 'unknown' }, undefined)).toBe('همهٔ محصولات')
  })
})
