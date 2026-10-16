// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { calls, envelope, failure } from '../bff/support'
import { page, serve } from '../settings/support'
import { API, GOOSHI_ENCODED, loadCatalog, mockCatalogApi, nextOf } from './support'

const mocks = mockCatalogApi()

describe('getBrands', () => {
  it('follows every page with limit=100, cached 300 s under the catalog tag', async () => {
    serve(mocks.fetch, {
      'product/brand/list/?limit=100&page=1': () => page([{ id: 1 }, { id: 2 }], `${API}x/?page=2`),
      'product/brand/list/?limit=100&page=2': () => page([{ id: 3 }]),
    })
    const { getBrands } = await loadCatalog()
    expect(await getBrands()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    const all = calls(mocks.fetch)
    expect(all).toHaveLength(2)
    for (const call of all) expect(nextOf(call)).toEqual({ revalidate: 300, tags: ['catalog'] })
  })

  it('stops after 20 pages when next never ends, keeping what it read', async () => {
    mocks.fetch.mockImplementation(async () => page([{ id: 1 }], `${API}x/?page=next`))
    const { getBrands } = await loadCatalog()
    expect(await getBrands()).toHaveLength(20)
    expect(mocks.fetch).toHaveBeenCalledTimes(20)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  it('throws when a page fails', async () => {
    serve(mocks.fetch, {
      'product/brand/list/?limit=100&page=1': () => page([{ id: 1 }], `${API}x/?page=2`),
    })
    const { getBrands } = await loadCatalog()
    await expect(getBrands()).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })
})

describe('getProductList', () => {
  const empty = {
    count: 0,
    total_pages: 1,
    current_page: 1,
    page_size: 24,
    next: null,
    previous: null,
    results: [],
  }

  it('sends the query in sorted key order with comma lists, cached 60 s', async () => {
    mocks.fetch.mockImplementation(async () => envelope(empty))
    const { getProductList } = await loadCatalog()
    expect(
      await getProductList({
        sort: 'price-asc',
        brand: ['samsung', 'apple'],
        has_discount: true,
        page: 2,
      }),
    ).toEqual(empty)
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(
      `${API}product/list/?brand=samsung%2Capple&has_discount=true&page=2&sort=price-asc`,
    )
    expect(nextOf(call)).toEqual({ revalidate: 60, tags: ['catalog'] })
  })

  it('sends no query for an empty listing query', async () => {
    mocks.fetch.mockImplementation(async () => envelope(empty))
    const { getProductList } = await loadCatalog()
    await getProductList({})
    expect(calls(mocks.fetch)[0]?.url).toBe(`${API}product/list/`)
  })

  it('lets the 404 of an out-of-range page propagate', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const { getProductList } = await loadCatalog()
    await expect(getProductList({ page: 99 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'not_found',
    })
  })

  it('sends a lone surrogate as U+FFFD instead of throwing', async () => {
    mocks.fetch.mockImplementation(async () => envelope(empty))
    const { getProductList } = await loadCatalog()
    await getProductList({ search: `a${String.fromCharCode(0xd800)}` })
    expect(calls(mocks.fetch)[0]?.url).toBe(`${API}product/list/?search=a%EF%BF%BD`)
  })
})

describe('getFilters', () => {
  it('resolves null on a 404 envelope', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const { getFilters } = await loadCatalog()
    expect(await getFilters({ category: 'nope' })).toBeNull()
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(`${API}product/filters/?category=nope`)
    expect(nextOf(call)).toEqual({ revalidate: 60, tags: ['category:nope', 'catalog'] })
  })

  it('throws on a 404 that is not the API (a proxy or dev-server HTML page)', async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response('Not Found', { status: 404, headers: { 'content-type': 'text/html' } }),
    )
    const { getFilters } = await loadCatalog()
    await expect(getFilters({ category: 'mobile-phone' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'non_json_response',
    })
  })

  it('sends only the first context, in the API priority category > brand > list', async () => {
    mocks.fetch.mockImplementation(async () => envelope({ categories: [] }))
    const { getFilters } = await loadCatalog()
    await getFilters({ list: 'flagship-phones', brand: 'apple', category: 'laptop' })
    await getFilters({ list: 'flagship-phones', brand: 'apple' })
    await getFilters({ list: 'flagship-phones' })
    await getFilters({})
    expect(calls(mocks.fetch).map((call) => [call.url, nextOf(call)?.tags])).toEqual([
      [`${API}product/filters/?category=laptop`, ['category:laptop', 'catalog']],
      [`${API}product/filters/?brand=apple`, ['brand:apple', 'catalog']],
      [`${API}product/filters/?list=flagship-phones`, ['list:flagship-phones', 'catalog']],
      [`${API}product/filters/`, ['catalog']],
    ])
  })

  it('encodes a still-encoded Persian slug once', async () => {
    mocks.fetch.mockImplementation(async () => envelope({ categories: [] }))
    const { getFilters } = await loadCatalog()
    await getFilters({ category: GOOSHI_ENCODED })
    expect(calls(mocks.fetch)[0]?.url).toBe(`${API}product/filters/?category=${GOOSHI_ENCODED}`)
  })

  it('is null without a request for a malformed slug, and throws on other failures', async () => {
    const { getFilters } = await loadCatalog()
    expect(await getFilters({ brand: 'abc%ZZ' })).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
    mocks.fetch.mockImplementation(async () => failure(500, 'server_error'))
    await expect(getFilters({ brand: 'apple' })).rejects.toMatchObject({ status: 500 })
  })
})
