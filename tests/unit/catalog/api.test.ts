// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { calls, envelope, failure } from '../bff/support'
import { page } from '../settings/support'
import { API, GOOSHI, GOOSHI_ENCODED, loadCatalog, mockCatalogApi, nextOf } from './support'

const DEFAULT_SETTINGS = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}

const mocks = mockCatalogApi()

describe('getProductSettings', () => {
  it('returns the API values, cached 300 s under the catalog tag', async () => {
    const live = { ...DEFAULT_SETTINGS, paginator_number: 12, show_out_of_stock_label: false }
    mocks.fetch.mockImplementation(async () => envelope(live))
    const { getProductSettings } = await loadCatalog()
    expect(await getProductSettings()).toEqual(live)
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(`${API}product/settings/`)
    expect(nextOf(call)).toEqual({ revalidate: 300, tags: ['catalog'] })
  })

  it('returns the defaults when fetch rejects, logging once without secrets', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'))
    const { getProductSettings } = await loadCatalog()
    expect(await getProductSettings()).toEqual(DEFAULT_SETTINGS)
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('key-123')
  })

  it('returns the defaults on an HTML error page', async () => {
    mocks.fetch.mockImplementation(async () => new Response('<html>502</html>', { status: 502 }))
    const { getProductSettings } = await loadCatalog()
    expect(await getProductSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back field by field when the payload is partial or mistyped', async () => {
    mocks.fetch.mockImplementation(async () =>
      envelope({
        paginator_number: '30',
        show_out_of_stock_label: false,
        related_items_number: -2,
      }),
    )
    const { getProductSettings } = await loadCatalog()
    expect(await getProductSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      show_out_of_stock_label: false,
    })
    mocks.fetch.mockImplementation(async () => envelope(['not', 'an', 'object']))
    expect(await (await loadCatalog()).getProductSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('getHomePage', () => {
  it('reads homepage/, cached 60 s under the home and catalog tags', async () => {
    const home = { page_title: 'فایرفلای', sections: [] }
    mocks.fetch.mockImplementation(async () => envelope(home))
    const { getHomePage } = await loadCatalog()
    expect(await getHomePage()).toEqual(home)
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(`${API}homepage/`)
    expect(nextOf(call)).toEqual({ revalidate: 60, tags: ['home', 'catalog'] })
  })

  it('throws on failure so the error boundary shows', async () => {
    mocks.fetch.mockImplementation(async () => failure(500, 'server_error'))
    const { getHomePage } = await loadCatalog()
    await expect(getHomePage()).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })
})

type DetailLoader = 'getCategory' | 'getBrand' | 'getListPage' | 'getProductDetail'

describe.each<[DetailLoader, string, string, number]>([
  ['getCategory', 'product/category', 'category', 300],
  ['getBrand', 'product/brand', 'brand', 300],
  ['getListPage', 'product/list-page', 'list', 300],
  ['getProductDetail', 'product/detail', 'product', 60],
])('%s', (loader, path, tag, revalidate) => {
  it('encodes a decoded or encoded Persian slug once and tags the decoded slug', async () => {
    mocks.fetch.mockImplementation(async () => envelope({ id: 1, slug: GOOSHI }))
    const api = await loadCatalog()
    expect(await api[loader](GOOSHI)).toEqual({ id: 1, slug: GOOSHI })
    expect(await api[loader](GOOSHI_ENCODED)).toEqual({ id: 1, slug: GOOSHI })
    for (const call of calls(mocks.fetch)) {
      expect(call.url).toBe(`${API}${path}/${GOOSHI_ENCODED}/`)
      expect(nextOf(call)).toEqual({ revalidate, tags: [`${tag}:${GOOSHI}`, 'catalog'] })
    }
  })

  it('returns null on a 404', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const api = await loadCatalog()
    expect(await api[loader]('nope')).toBeNull()
  })

  it('throws on a 404 that is not the API (a proxy or dev-server HTML page)', async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response('<html><body>Not Found</body></html>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const api = await loadCatalog()
    await expect(api[loader]('x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'non_json_response',
    })
  })

  it('throws on any other failure', async () => {
    mocks.fetch.mockImplementation(async () => failure(503, 'feature_disabled'))
    const api = await loadCatalog()
    await expect(api[loader]('x')).rejects.toMatchObject({ name: 'ApiError', status: 503 })
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'))
    await expect(api[loader]('x')).rejects.toMatchObject({ name: 'ApiError', status: 0 })
  })

  it('returns null without a request for a slug that cannot be one path segment', async () => {
    const api = await loadCatalog()
    for (const raw of ['abc%ZZ', '', '.', '..', '%2E%2E', 'a/b', 'a%2Fvariants']) {
      expect(await api[loader](raw), raw).toBeNull()
    }
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe.each<[Exclude<DetailLoader, 'getProductDetail'>]>([
  ['getCategory'],
  ['getBrand'],
  ['getListPage'],
])('%s("list")', (loader) => {
  it('is null without a request: the API routes <kind>/list/ to the list endpoint', async () => {
    const api = await loadCatalog()
    expect(await api[loader]('list')).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('getProductDetail("list")', () => {
  it('asks the API: product/detail/list/ is an ordinary product path', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const api = await loadCatalog()
    expect(await api.getProductDetail('list')).toBeNull()
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(`${API}product/detail/list/`)
  })
})

describe('public catalog reads', () => {
  it('never send a token, a cart token or the visitor IP, and always the API key', async () => {
    mocks.fetch.mockImplementation(async () => page([]))
    const api = await loadCatalog()
    await api.getProductSettings()
    await api.getHomePage()
    await api.getCategory('mobile-phone')
    await api.getBrand('apple')
    await api.getListPage('flagship-phones')
    await api.getBrands()
    await api.getProductList({ category: 'mobile-phone' })
    await api.getFilters({ category: 'mobile-phone' })
    await api.getProductDetail('samsung-galaxy-s25-ultra')
    const all = calls(mocks.fetch)
    expect(all).toHaveLength(9)
    for (const call of all) {
      expect(call.init.method).toBe('GET')
      expect(call.headers.get('X-API-Key')).toBe('key-123')
      for (const header of ['Authorization', 'X-Cart-Token', 'X-Forwarded-For']) {
        expect(call.headers.has(header), `${call.url} ${header}`).toBe(false)
      }
    }
  })
})
