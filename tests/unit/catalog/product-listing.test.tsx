import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { cardFixture } from './card-fixtures'
import { MOBILE_FILTERS } from './filter-fixtures'
import { GENERIC, listOf, PROPS, SETTINGS, STORE_FILTERS } from './listing-support'
import { navigation, resetNavigation } from './navigation-harness'

const api = vi.hoisted(() => ({
  getProductList: vi.fn(),
  getFilters: vi.fn(),
  getProductSettings: vi.fn(),
  getListPage: vi.fn(),
}))
const settings = vi.hoisted(() => ({ getCategoryTree: vi.fn() }))
vi.mock('@/features/catalog/api', () => api)
vi.mock('@/features/settings/api', () => settings)
vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

stubBrowserApis()

beforeEach(() => {
  vi.clearAllMocks()
  resetNavigation()
  settings.getCategoryTree.mockResolvedValue([])
  api.getListPage.mockResolvedValue(null)
  api.getFilters.mockResolvedValue(MOBILE_FILTERS)
  api.getProductSettings.mockResolvedValue(SETTINGS)
  api.getProductList.mockResolvedValue(listOf([cardFixture()]))
})

/** Holds the list request open, to see what else was asked for in the meantime. */
function holdList() {
  let release: (value: unknown) => void = () => {}
  api.getProductList.mockReturnValue(new Promise((resolve) => (release = resolve)))
  return () => release(listOf([cardFixture()]))
}

describe('ProductListing data', () => {
  it('loads the list (route context and default sort applied) and the filters in parallel', async () => {
    const release = holdList()
    const rendering = ProductListing({
      ...PROPS,
      searchParams: Promise.resolve({ category: 'laptop', brand: 'apple', page: '2', x: 'y' }),
      defaultSort: 'sale',
    })
    await vi.waitFor(() =>
      expect(api.getFilters).toHaveBeenCalledWith({ category: 'mobile-phone' }),
    )
    // The route's category wins over the URL's: one filters call, for the route.
    expect(api.getFilters).toHaveBeenCalledOnce()
    expect(api.getProductList).toHaveBeenCalledWith({
      category: 'mobile-phone',
      brand: ['apple'],
      page: 2,
      sort: 'sale',
    })
    release()
    await expect(rendering).resolves.toBeTruthy()
  })

  it('keeps the URL sort over the default sort', async () => {
    await ProductListing({ ...PROPS, searchParams: { sort: 'price-asc' }, defaultSort: 'sale' })
    expect(api.getProductList).toHaveBeenCalledWith({ category: 'mobile-phone', sort: 'price-asc' })
  })

  it('calls notFound() when the API answers 404 for a page past the last', async () => {
    api.getProductList.mockRejectedValue(new ApiError({ status: 404, code: 'not_found' }))
    await expect(
      ProductListing({ ...PROPS, searchParams: Promise.resolve({ page: '999' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(navigation.notFound).toHaveBeenCalledOnce()
  })

  it('throws any other failure to the error boundary, a proxy 404 page included', async () => {
    for (const error of [ApiError.nonJson(404), new ApiError({ status: 500 })]) {
      api.getProductList.mockRejectedValueOnce(error)
      await expect(ProductListing(PROPS)).rejects.toBe(error)
    }
    api.getFilters.mockRejectedValueOnce(new ApiError({ status: 503 }))
    await expect(ProductListing(PROPS)).rejects.toMatchObject({ status: 503 })
    expect(navigation.notFound).not.toHaveBeenCalled()
  })
})

describe('ProductListing filter metadata for URL filters', () => {
  it('loads a URL category’s filters beside the route’s, in parallel with the list', async () => {
    const release = holdList()
    const rendering = ProductListing({ ...PROPS, ...GENERIC, searchParams: { category: 'laptop' } })
    await vi.waitFor(() => expect(api.getFilters).toHaveBeenCalledTimes(2))
    expect(api.getFilters).toHaveBeenCalledWith({ category: 'laptop' })
    expect(api.getFilters).toHaveBeenCalledWith({})
    expect(settings.getCategoryTree).toHaveBeenCalledOnce()
    release()
    await expect(rendering).resolves.toBeTruthy()
  })

  it('keeps the route’s other context keys in the category’s filters call', async () => {
    await ProductListing({
      ...PROPS,
      context: { brand: 'samsung' },
      basePath: '/brand/samsung/',
      searchParams: { category: 'mobile-phone' },
    })
    expect(api.getFilters).toHaveBeenCalledWith({ brand: 'samsung', category: 'mobile-phone' })
    expect(api.getFilters).toHaveBeenCalledWith({ brand: 'samsung' })
  })

  it('loads a URL list’s filters and name on the generic listing, in parallel with the list', async () => {
    const release = holdList()
    const rendering = ProductListing({
      ...PROPS,
      ...GENERIC,
      searchParams: { list: 'best-selling-digital' },
    })
    await vi.waitFor(() => expect(api.getFilters).toHaveBeenCalledTimes(2))
    expect(api.getFilters).toHaveBeenCalledWith({ list: 'best-selling-digital' })
    expect(api.getFilters).toHaveBeenCalledWith({})
    expect(api.getListPage).toHaveBeenCalledWith('best-selling-digital')
    expect(api.getProductList).toHaveBeenCalledWith({ list: 'best-selling-digital' })
    release()
    await expect(rendering).resolves.toBeTruthy()
  })

  it('stacks a URL category on a URL list: three filters calls', async () => {
    await ProductListing({
      ...PROPS,
      ...GENERIC,
      searchParams: { list: 'deals', category: 'laptop' },
    })
    expect(api.getFilters.mock.calls.map(([ctx]) => ctx)).toEqual([
      {},
      { list: 'deals' },
      { list: 'deals', category: 'laptop' },
    ])
  })

  it('names a URL list on a brand page but keeps the brand’s filters', async () => {
    api.getFilters.mockResolvedValue(STORE_FILTERS)
    await ProductListing({
      ...PROPS,
      context: { brand: 'samsung' },
      basePath: '/brand/samsung/',
      searchParams: { list: 'deals' },
    })
    expect(api.getFilters.mock.calls).toEqual([[{ brand: 'samsung' }]])
    expect(api.getListPage).toHaveBeenCalledWith('deals')
  })

  it('asks for nothing more on a list page, whose URL list is ignored', async () => {
    await ProductListing({
      ...PROPS,
      context: { list: 'flagship-phones' },
      basePath: '/product/list/flagship-phones/',
      searchParams: { list: 'other' },
    })
    expect(api.getFilters.mock.calls).toEqual([[{ list: 'flagship-phones' }]])
    expect(api.getListPage).not.toHaveBeenCalled()
    expect(settings.getCategoryTree).not.toHaveBeenCalled()
  })
})
