import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  activeFilters,
  clearFilters,
  facetGroups,
  filtersContextFor,
} from '@/features/catalog/listing-filters'
import { LIST_CATEGORIES, MOBILE_FILTERS, STORE_BRANDS } from './filter-fixtures'

const STORE = { ...MOBILE_FILTERS, categories: LIST_CATEGORIES, brands: STORE_BRANDS }

describe('facetGroups', () => {
  it('offers every group with something to choose on the generic listing', () => {
    const groups = facetGroups(STORE, {})
    expect(groups.categories).toBe(LIST_CATEGORIES)
    expect(groups.brands).toBe(STORE_BRANDS)
    expect(groups.attributes.map((attribute) => attribute.name)).toEqual([
      'حافظه داخلی',
      'حافظه رم',
      'رنگ',
    ])
    expect(groups.price).toEqual({ min: 1_250_000, max: 134_500_000 })
  })

  it('leaves out the facet of the key the route context supplies', () => {
    expect(facetGroups(STORE, { category: 'mobile-phone' }).categories).toEqual([])
    expect(facetGroups(STORE, { brand: 'samsung' }).brands).toEqual([])
    expect(facetGroups(STORE, { list: 'best-selling-digital' }).brands).toBe(STORE_BRANDS)
  })

  it('leaves out groups with nothing to offer', () => {
    const groups = facetGroups(
      {
        ...STORE,
        categories: LIST_CATEGORIES.map((option) => ({ ...option, product_count: 0 })),
        attributes: [{ id: 1, name: 'خالی', input_type: 'select', values: [] }],
        price: { min: 0, max: 0 },
      },
      {},
    )
    expect(groups.categories).toEqual([])
    expect(groups.attributes).toEqual([])
    expect(groups.price).toBeNull()
    expect(facetGroups(STORE, {}).price).not.toBeNull()
    expect(facetGroups({ ...STORE, price: { min: 5, max: 5 } }, {}).price).toBeNull()
  })

  it('takes the category options from the route-context metadata when given', () => {
    const base = { ...STORE, attributes: [] }
    const groups = facetGroups(MOBILE_FILTERS, {}, base)
    expect(groups.categories).toBe(LIST_CATEGORIES)
    expect(groups.brands).toBe(MOBILE_FILTERS.brands)
    expect(groups.attributes).toHaveLength(3)
  })

  it('has no facets without filter metadata', () => {
    expect(facetGroups(null, {})).toEqual({
      categories: [],
      brands: [],
      attributes: [],
      price: null,
    })
  })
})

describe('activeFilterCount and clearFilters', () => {
  const query = {
    search: 'گوشی',
    category: 'laptop',
    brand: ['apple', 'samsung'],
    attribute_values: [10001, 10014],
    min_price: 1,
    max_price: 9,
    in_stock: true,
    has_discount: false,
    special_first: false,
    sort: 'sale' as const,
    page: 2,
  }

  it('counts each chosen value; a price range counts once; sort and page are not filters', () => {
    expect(activeFilterCount(query)).toBe(9)
    expect(activeFilterCount({ sort: 'sale', page: 3, special_first: false })).toBe(0)
  })

  it('keeps only the sort and special_first', () => {
    expect(clearFilters(query)).toEqual({ sort: 'sale', special_first: false })
    expect(clearFilters({ brand: ['apple'] })).toEqual({})
  })
})

describe('activeFilters', () => {
  const groups = facetGroups(STORE, {})

  it('labels each active filter from the metadata, with a patch that removes only it', () => {
    const chips = activeFilters(
      {
        category: 'laptop',
        brand: ['apple', 'xiaomi'],
        attribute_values: [10001, 10015],
        min_price: 2_000_000,
        in_stock: true,
        search: 'آیفون',
        sort: 'sale',
      },
      groups,
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      'جستجو: آیفون',
      'لپ تاپ و الترابوک',
      'اپل',
      'شیائومی',
      'حافظه داخلی: ۲۵۶ گیگابایت',
      'رنگ: مشکی',
      'از ۲٬۰۰۰٬۰۰۰ تومان',
      'فقط کالاهای موجود',
    ])
    const patches = Object.fromEntries(chips.map((chip) => [chip.label, chip.patch]))
    expect(patches['اپل']).toEqual({ brand: ['xiaomi'] })
    expect(patches['رنگ: مشکی']).toEqual({ attribute_values: [10015] })
    expect(patches['لپ تاپ و الترابوک']).toEqual({ category: undefined })
    expect(patches['از ۲٬۰۰۰٬۰۰۰ تومان']).toEqual({ min_price: undefined, max_price: undefined })
    expect(patches['فقط کالاهای موجود']).toEqual({ in_stock: undefined })
  })

  it('labels a price range, a false flag and values missing from the metadata', () => {
    const chips = activeFilters(
      {
        min_price: 1_000,
        max_price: 5_000,
        has_discount: false,
        brand: ['unknown-brand'],
        attribute_values: [99],
      },
      groups,
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      'unknown-brand',
      'ویژگی ۹۹',
      'از ۱٬۰۰۰ تا ۵٬۰۰۰ تومان',
      'بدون تخفیف',
    ])
    expect(activeFilters({ max_price: 5_000 }, groups)[0]?.label).toBe('تا ۵٬۰۰۰ تومان')
  })

  it('gives each chip a unique key', () => {
    const chips = activeFilters(
      { brand: ['a', 'b'], attribute_values: [1, 2], in_stock: true },
      groups,
    )
    expect(new Set(chips.map((chip) => chip.key)).size).toBe(chips.length)
  })
})

describe('filtersContextFor', () => {
  it('adds the URL category when the route has no category of its own', () => {
    expect(filtersContextFor({}, { category: 'mobile-phone', brand: ['apple'] })).toEqual({
      category: 'mobile-phone',
    })
    expect(filtersContextFor({ brand: 'samsung' }, { category: 'digital' })).toEqual({
      brand: 'samsung',
      category: 'digital',
    })
    expect(filtersContextFor({ list: 'deals' }, { category: 'laptop' })).toEqual({
      list: 'deals',
      category: 'laptop',
    })
  })

  it('is null when the route context is all there is', () => {
    expect(filtersContextFor({}, { brand: ['apple'] })).toBeNull()
    expect(filtersContextFor({ category: 'mobile-phone' }, { category: 'mobile-phone' })).toBeNull()
  })
})
