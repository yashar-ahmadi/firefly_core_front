import { describe, expect, it } from 'vitest'
import { parseListingParams, toSearchParams } from '@/features/catalog/listing-params'
import { SORT_VALUES } from '@/lib/api/types/catalog'

describe('parseListingParams', () => {
  it('drops a bad sort, a non-numeric price, a non-boolean flag, blank and bad list entries and page 0', () => {
    expect(
      parseListingParams({
        sort: 'bad',
        min_price: 'abc',
        in_stock: 'yes',
        brand: 'samsung,,apple',
        attribute_values: '10005,x,10015',
        page: '0',
      }),
    ).toEqual({ brand: ['samsung', 'apple'], attribute_values: [10005, 10015] })
  })

  it('keeps valid values with their types', () => {
    expect(parseListingParams({ has_discount: 'true', sort: 'price-asc', page: '2' })).toEqual({
      has_discount: true,
      sort: 'price-asc',
      page: 2,
    })
  })

  it('reads every API parameter', () => {
    expect(
      parseListingParams({
        search: '  گوشی سامسونگ ',
        category: 'mobile-phone',
        brand: 'apple',
        list: 'flagship-phones',
        attribute_values: '10005',
        min_price: '1000000',
        max_price: '9000000',
        in_stock: '1',
        is_special: '0',
        has_discount: 'false',
        special_first: 'FALSE',
        sort: 'sale',
        page: '3',
      }),
    ).toEqual({
      search: 'گوشی سامسونگ',
      category: 'mobile-phone',
      brand: ['apple'],
      list: 'flagship-phones',
      attribute_values: [10005],
      min_price: 1000000,
      max_price: 9000000,
      in_stock: true,
      is_special: false,
      has_discount: false,
      special_first: false,
      sort: 'sale',
      page: 3,
    })
  })

  it('accepts every documented sort value and nothing else', () => {
    for (const sort of SORT_VALUES) expect(parseListingParams({ sort })).toEqual({ sort })
    for (const sort of ['', 'PRICE-ASC', 'price', 'date-desc ', 'added-desc']) {
      expect(parseListingParams({ sort }), sort).toEqual({})
    }
  })

  it('drops unknown keys, including limit (the page size is the store setting)', () => {
    expect(parseListingParams({ foo: 'bar', limit: '100', q: 'x', constructor: 'y' })).toEqual({})
  })

  it('ignores category, brand and list when the route supplies the context', () => {
    const sp = { category: 'laptop', brand: 'apple', list: 'flagship-phones', sort: 'sale' }
    expect(parseListingParams(sp, { allowContext: false })).toEqual({ sort: 'sale' })
    expect(parseListingParams(sp, { allowContext: true })).toEqual({
      category: 'laptop',
      brand: ['apple'],
      list: 'flagship-phones',
      sort: 'sale',
    })
  })

  it('converts Persian and Arabic-Indic digits in numeric parameters', () => {
    expect(
      parseListingParams({
        page: '۲',
        min_price: '۱۰۰۰',
        max_price: '٢٥٠٠',
        attribute_values: '۱۰۰۰۵,10015',
      }),
    ).toEqual({ page: 2, min_price: 1000, max_price: 2500, attribute_values: [10005, 10015] })
  })

  it('takes the first value of a repeated scalar and merges repeated lists', () => {
    expect(
      parseListingParams({
        sort: ['price-asc', 'sale'],
        page: ['bad', '4'],
        brand: ['apple', 'samsung,xiaomi', 'apple'],
        attribute_values: ['10005', '10015,10005'],
      }),
    ).toEqual({
      sort: 'price-asc',
      brand: ['apple', 'samsung', 'xiaomi'],
      attribute_values: [10005, 10015],
    })
  })

  it('drops negative, fractional, exponent, NaN and unsafe numbers', () => {
    for (const value of [
      '-5',
      '1.5',
      '1e3',
      'NaN',
      'Infinity',
      '',
      ' ',
      '0x10',
      '99999999999999999999',
    ]) {
      expect(
        parseListingParams({ min_price: value, max_price: value, page: value }),
        value,
      ).toEqual({})
      expect(parseListingParams({ attribute_values: value }), value).toEqual({})
    }
    expect(parseListingParams({ min_price: '0', page: ' 7 ' })).toEqual({ min_price: 0, page: 7 })
    expect(parseListingParams({ attribute_values: '0,-1,10001' })).toEqual({
      attribute_values: [10001],
    })
  })

  it('drops empty strings and whitespace-only values', () => {
    expect(
      parseListingParams({ search: '   ', category: '', brand: ' , ', list: ' ', in_stock: '' }),
    ).toEqual({})
  })

  it('caps the search term and the list lengths', () => {
    const long = 'ک'.repeat(500)
    expect(parseListingParams({ search: long }).search).toHaveLength(200)
    const brands = Array.from({ length: 80 }, (_, i) => `b${i}`).join(',')
    expect(parseListingParams({ brand: brands }).brand).toHaveLength(50)
  })

  it('never throws on hostile input', () => {
    const hostile = [
      {},
      { sort: [] },
      { page: [] },
      { brand: [] },
      { search: String.fromCharCode(0xd800) },
      { page: undefined, sort: undefined },
      { page: 5 as unknown as string, brand: { a: 1 } as unknown as string },
      { search: null as unknown as string },
    ]
    for (const sp of hostile) expect(() => parseListingParams(sp)).not.toThrow()
  })
})

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
