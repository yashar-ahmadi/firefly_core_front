import { describe, expect, it } from 'vitest'
import { parseListingParams, toSearchParams } from '@/features/catalog/listing-params'

describe('toSearchParams', () => {
  it('round-trips a parsed query in sorted key order', () => {
    const query = parseListingParams({ has_discount: 'true', sort: 'price-asc', page: '2' })
    const params = toSearchParams(query)
    expect(params.toString()).toBe('has_discount=true&page=2&sort=price-asc')
    expect(parseListingParams(Object.fromEntries(params))).toEqual(query)
  })

  it('joins lists with commas and round-trips every parameter', () => {
    const query = parseListingParams({
      search: 'گوشی',
      category: 'mobile-phone',
      brand: 'samsung,apple',
      attribute_values: '10005,10015',
      min_price: '0',
      max_price: '5000000',
      in_stock: 'false',
      special_first: 'false',
      sort: 'date-desc',
    })
    const params = toSearchParams(query)
    expect([...params.keys()]).toEqual([...params.keys()].sort())
    expect(params.get('brand')).toBe('samsung,apple')
    expect(params.get('attribute_values')).toBe('10005,10015')
    expect(params.get('in_stock')).toBe('false')
    expect(parseListingParams(Object.fromEntries(params))).toEqual(query)
  })

  it('omits the defaults page 1 and special_first=true, and empty values', () => {
    expect(
      toSearchParams({
        page: 1,
        special_first: true,
        brand: [],
        attribute_values: [],
        search: '',
      }).toString(),
    ).toBe('')
  })

  it('keeps sort=date-desc, because a route may default to another sort', () => {
    expect(toSearchParams({ sort: 'date-desc' }).toString()).toBe('sort=date-desc')
  })

  it('keeps limit when the caller sets it', () => {
    expect(toSearchParams({ limit: 10, sort: 'sale' }).toString()).toBe('limit=10&sort=sale')
  })

  it('skips numbers that are not safe non-negative integers', () => {
    expect(
      toSearchParams({
        min_price: Number.NaN,
        max_price: -1,
        page: 2.5,
        limit: Number.POSITIVE_INFINITY,
        attribute_values: [Number.NaN, 10005],
      }).toString(),
    ).toBe('attribute_values=10005')
  })
})
