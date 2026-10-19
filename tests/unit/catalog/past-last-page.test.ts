// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calls, envelope, failure } from '../bff/support'
import { API, loadCatalog, mockCatalogApi } from './support'

// A listing page past its last (Plan 5 Task 7, carried from Plan 2): the API answers 404 («صفحه
// نامعتبر») and the page is a 404 (Plan 2's listing rule, R9). The Data Cache keeps only
// successful fetches, so that 404 is remembered for a minute like a detail 404 (the negative
// cache, ./loaders/missing.ts): a crawler asking for `?page=9999` again costs no API call.

const mocks = mockCatalogApi()

afterEach(() => {
  vi.doUnmock('@/features/catalog/loaders/missing')
  vi.doUnmock('@/lib/api/errors')
})

/**
 * The loaders on the next request: new React `cache()` wrappers, the remembered 404s kept (and
 * the one `ApiError` class they are thrown with, as in the server's single module graph).
 */
async function nextRequest() {
  const missing = await import('@/features/catalog/loaders/missing')
  const errors = await import('@/lib/api/errors')
  vi.resetModules()
  vi.doMock('@/features/catalog/loaders/missing', () => missing)
  vi.doMock('@/lib/api/errors', () => errors)
  return import('@/features/catalog/api')
}

const PAST = { category: 'mobile-phone', page: 99, sort: 'date-desc' as const }

describe('a listing page past its last', () => {
  it('is a 404 whose answer is remembered: asked for again, no API call', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    const first = await loadCatalog()
    expect(await first.isPastLastPage(PAST)).toBe(true)
    const next = await nextRequest()
    expect(await next.isPastLastPage(PAST)).toBe(true)
    await expect(next.getProductList(PAST)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    expect(calls(mocks.fetch).map((call) => call.url)).toEqual([
      `${API}product/list/?category=mobile-phone&page=99&sort=date-desc`,
    ])
  })

  it('another page or another query is asked for', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    await (await loadCatalog()).isPastLastPage(PAST)
    const next = await nextRequest()
    await next.isPastLastPage({ ...PAST, page: 98 })
    await next.isPastLastPage({ ...PAST, sort: 'price-asc' })
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
  })

  it('a page that exists is never remembered', async () => {
    mocks.fetch.mockImplementation(async () =>
      envelope({
        count: 30,
        total_pages: 2,
        current_page: 2,
        next: null,
        previous: null,
        results: [],
      }),
    )
    expect(await (await loadCatalog()).isPastLastPage({ ...PAST, page: 2 })).toBe(false)
    expect(await (await nextRequest()).isPastLastPage({ ...PAST, page: 2 })).toBe(false)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('never remembers another failure, nor a 404 page from a proxy in front of the API', async () => {
    mocks.fetch.mockImplementation(async () => failure(500, 'server_error'))
    await expect((await loadCatalog()).isPastLastPage(PAST)).rejects.toMatchObject({ status: 500 })
    mocks.fetch.mockImplementation(
      async () =>
        new Response('Not Found', { status: 404, headers: { 'content-type': 'text/html' } }),
    )
    await expect((await nextRequest()).isPastLastPage(PAST)).rejects.toMatchObject({ status: 404 })
    await expect((await nextRequest()).isPastLastPage(PAST)).rejects.toMatchObject({ status: 404 })
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
  })

  it('page 1 is never looked up, and a 404 without a page is never remembered', async () => {
    mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
    expect(await (await loadCatalog()).isPastLastPage({ category: 'mobile-phone' })).toBe(false)
    expect(mocks.fetch).not.toHaveBeenCalled()
    await expect((await nextRequest()).getProductList({ category: 'x' })).rejects.toMatchObject({
      status: 404,
    })
    await expect((await nextRequest()).getProductList({ category: 'x' })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('forgets it after a minute: the page may exist by then', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-19T10:00:00Z'))
      mocks.fetch.mockImplementation(async () => failure(404, 'not_found'))
      await (await loadCatalog()).isPastLastPage(PAST)
      vi.setSystemTime(new Date('2026-10-19T10:00:59Z'))
      expect(await (await nextRequest()).isPastLastPage(PAST)).toBe(true)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-10-19T10:01:00Z'))
      mocks.fetch.mockImplementation(async () =>
        envelope({
          count: 2400,
          total_pages: 99,
          current_page: 99,
          next: null,
          previous: null,
          results: [],
        }),
      )
      expect(await (await nextRequest()).isPastLastPage(PAST)).toBe(false)
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
