// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { calls, envelope, failure } from '../bff/support'
import { API, loadCatalog, mockCatalogApi, nextOf, requestHeaders } from './support'

// How the catalog protects the storefront's single-address anonymous API budget: long-tail
// listing queries carry the visitor IP, and detail 404s are remembered for a minute.

const mocks = mockCatalogApi()

const EMPTY = {
  count: 0,
  total_pages: 1,
  current_page: 1,
  page_size: 24,
  next: null,
  previous: null,
  results: [],
}

describe('getProductList and the visitor IP', () => {
  it.each([
    ['a search term', { search: 'گوشی' }],
    ['a minimum price', { min_price: 0 }],
    ['a maximum price', { max_price: 5_000_000 }],
    ['attribute values', { attribute_values: [12] }],
    ['two brands', { brand: ['samsung', 'apple'] }],
    ['a search on a category page', { category: 'mobile-phone', search: 'a', page: 2 }],
  ])('sends it for %s, still cached 60 s (a per-visitor entry)', async (_label, query) => {
    mocks.fetch.mockImplementation(async () => envelope(EMPTY))
    const { getProductList } = await loadCatalog()
    await getProductList(query)
    const [call] = calls(mocks.fetch)
    expect(call?.headers.get('X-Forwarded-For')).toBe('198.51.100.7')
    expect(nextOf(call)).toEqual({ revalidate: 60, tags: ['catalog'] })
  })

  it.each([
    ['no parameters', {}],
    ['a sort', { sort: 'price-asc' as const }],
    ['a page', { page: 3 }],
    ['the toggles', { in_stock: true, is_special: true, has_discount: true, special_first: false }],
    ['one brand', { brand: ['samsung'] }],
    ['a category context', { category: 'mobile-phone', sort: 'date-desc' as const }],
    ['a list context', { list: 'flagship-phones', page: 2 }],
  ])('never sends it for %s: the entry is shared by every visitor', async (_label, query) => {
    mocks.fetch.mockImplementation(async () => envelope(EMPTY))
    const { getProductList } = await loadCatalog()
    await getProductList(query)
    expect(calls(mocks.fetch)[0]?.headers.has('X-Forwarded-For')).toBe(false)
  })

  it('reads the IP from CLIENT_IP_HEADER and sends none when forwarding is off', async () => {
    mocks.fetch.mockImplementation(async () => envelope(EMPTY))
    vi.stubEnv('CLIENT_IP_HEADER', 'cf-connecting-ip')
    requestHeaders['cf-connecting-ip'] = '192.0.2.44'
    let catalog = await loadCatalog()
    await catalog.getProductList({ search: 'x' })
    expect(calls(mocks.fetch)[0]?.headers.get('X-Forwarded-For')).toBe('192.0.2.44')

    vi.stubEnv('CLIENT_IP_HEADER', 'none')
    catalog = await loadCatalog()
    await catalog.getProductList({ search: 'x' })
    expect(calls(mocks.fetch)[1]?.headers.has('X-Forwarded-For')).toBe(false)
  })

  it('classifies queries with isLongTail', async () => {
    await loadCatalog()
    const { isLongTail } = await import('@/features/catalog/loaders/listing')
    expect(isLongTail({ search: '' })).toBe(false)
    expect(isLongTail({ attribute_values: [] })).toBe(false)
    expect(isLongTail({ brand: ['a', 'b'] })).toBe(true)
  })
})

describe('remembered 404s', () => {
  const loaders = [
    ['getProductDetail', 'product/detail/nope/'],
    ['getCategory', 'product/category/nope/'],
    ['getBrand', 'product/brand/nope/'],
    ['getListPage', 'product/list-page/nope/'],
  ] as const

  it.each(loaders)('%s asks the API once for a repeated unknown slug', async (name, path) => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const catalog = await loadCatalog()
    expect(await catalog[name]('nope')).toBeNull()
    // React cache() lives per render; a fresh loader import stands in for the next request.
    expect(await (await reload())[name]('nope')).toBeNull()
    expect(calls(mocks.fetch).map((call) => call.url)).toEqual([`${API}${path}`])
  })

  it.each(loaders)('%s never remembers other failures', async (name) => {
    mocks.fetch.mockImplementation(async () => failure(500, 'server_error'))
    const catalog = await loadCatalog()
    await expect(catalog[name]('flaky')).rejects.toMatchObject({ status: 500 })
    await expect((await reload())[name]('flaky')).rejects.toMatchObject({ status: 500 })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('never remembers a 404 page from a proxy in front of the API', async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response('Not Found', { status: 404, headers: { 'content-type': 'text/html' } }),
    )
    const catalog = await loadCatalog()
    await expect(catalog.getProductDetail('x')).rejects.toMatchObject({ status: 404 })
    await expect((await reload()).getProductDetail('x')).rejects.toMatchObject({ status: 404 })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('forgets a 404 after 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
      mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
      await (await loadCatalog()).getBrand('gone')
      vi.setSystemTime(new Date('2026-10-16T10:00:59Z'))
      await (await reload()).getBrand('gone')
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-10-16T10:01:00Z'))
      mocks.fetch.mockImplementation(async () => envelope({ id: 1, slug: 'gone' }))
      expect(await (await reload()).getBrand('gone')).toEqual({ id: 1, slug: 'gone' })
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('remembers an unknown filters context too', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    await (await loadCatalog()).getFilters({ category: 'nope' })
    await (await reload()).getFilters({ category: 'nope' })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
})

/**
 * The loaders again with the remembered 404s kept: only the React `cache()` wrappers are new
 * (as on the next request), not the module that holds the list.
 */
async function reload() {
  const missing = await import('@/features/catalog/loaders/missing')
  vi.resetModules()
  vi.doMock('@/features/catalog/loaders/missing', () => missing)
  return import('@/features/catalog/api')
}
