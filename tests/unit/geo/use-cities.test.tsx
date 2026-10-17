import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVINCES_KEY } from '@/features/geo/api'
import { useCities } from '@/features/geo/use-cities'
import { useProvinces } from '@/features/geo/use-provinces'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'
import { geoPage, ISFAHAN, ISFAHAN_CITIES, PROVINCES, TEHRAN, TEHRAN_CITIES } from './fixtures'

// Provinces and cities (cart digest §8): public lists read through the BFF with `limit=1500`,
// every page, cached a day; the cities per province, and a stale province id (`invalid_choice`)
// reloads the provinces and resets the choice.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

type Query = { province?: number; limit?: number; page?: number }

function answer(path: string, { query }: { query?: Query } = {}) {
  if (path === 'transportation/province/list/') return Promise.resolve(geoPage(PROVINCES))
  if (path === 'transportation/city/list/') {
    if (query?.province === TEHRAN.id) return Promise.resolve(geoPage(TEHRAN_CITIES))
    if (query?.province === ISFAHAN.id) return Promise.resolve(geoPage(ISFAHAN_CITIES))
  }
  return Promise.reject(new Error(`unexpected ${path} ${JSON.stringify(query)}`))
}

const calls = (path: string) =>
  mocks.bffFetch.mock.calls.filter(([called]) => called === path).map(([, options]) => options)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.bffFetch.mockImplementation(answer)
})

describe('useProvinces', () => {
  it('reads the whole list in one page of 1500, under ["geo","provinces"], fresh for a day', async () => {
    const { client, wrapper } = clientProviders()
    const { result } = renderHook(() => useProvinces(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(PROVINCES))
    expect(calls('transportation/province/list/')).toEqual([
      expect.objectContaining({ query: { limit: 1500, page: 1 } }),
    ])
    expect(client.getQueryState(PROVINCES_KEY)?.data).toEqual(PROVINCES)
    expect(client.getQueryCache().find({ queryKey: PROVINCES_KEY })?.isStale()).toBe(false)
  })

  it('reads every page when the API pages it anyway (it trusts total_pages, not a size)', async () => {
    mocks.bffFetch.mockImplementation((path: string, { query }: { query: Query }) =>
      Promise.resolve(
        query.page === 1
          ? geoPage(PROVINCES.slice(0, 2), { page: 1, totalPages: 2 })
          : geoPage(PROVINCES.slice(2), { page: 2, totalPages: 2 }),
      ),
    )
    const { wrapper } = clientProviders()
    const { result } = renderHook(() => useProvinces(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(PROVINCES))
    expect(calls('transportation/province/list/')).toHaveLength(2)
  })
})

describe('useCities', () => {
  it('asks nothing until a province is chosen', async () => {
    const { wrapper } = clientProviders()
    const { result } = renderHook(() => useCities(null), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.data).toBeUndefined()
    expect(result.current.fetchStatus).toBe('idle')
    expect(calls('transportation/city/list/')).toEqual([])
  })

  it('reads the cities of each province, never showing another province’s meanwhile', async () => {
    const { wrapper } = clientProviders()
    const { result, rerender } = renderHook(({ province }) => useCities(province), {
      wrapper,
      initialProps: { province: TEHRAN.id as number | null },
    })
    await waitFor(() => expect(result.current.data).toEqual(TEHRAN_CITIES))
    expect(calls('transportation/city/list/')).toEqual([
      expect.objectContaining({ query: { province: TEHRAN.id, limit: 1500, page: 1 } }),
    ])

    rerender({ province: ISFAHAN.id })
    // The choice changed: Tehran's cities are gone at once (no placeholder of the last list).
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual(ISFAHAN_CITIES))

    rerender({ province: TEHRAN.id })
    // Cached for the day: no second read.
    expect(result.current.data).toEqual(TEHRAN_CITIES)
    expect(calls('transportation/city/list/')).toHaveLength(2)

    rerender({ province: null })
    expect(result.current.data).toBeUndefined()
  })

  it('a stale province id (invalid_choice): reloads the provinces, drops the cities, resets', async () => {
    const { client, wrapper } = clientProviders()
    const provinces = renderHook(() => useProvinces(), { wrapper })
    await waitFor(() => expect(provinces.result.current.data).toEqual(PROVINCES))
    client.setQueryData(['geo', 'cities', TEHRAN.id], TEHRAN_CITIES)

    const stale = ApiError.fromBody(400, {
      msg: 'خطا',
      data: {
        type: 'validation_error',
        errors: [
          {
            code: 'invalid_choice',
            detail: 'یک گزینهٔ معتبر انتخاب کنید. 9999 از گزینه‌های موجود نیست.',
            attr: 'province',
          },
        ],
      },
    })
    mocks.bffFetch.mockImplementation((path: string, options: { query?: Query }) =>
      path === 'transportation/city/list/' && options.query?.province === 9999
        ? Promise.reject(stale)
        : answer(path, options),
    )
    const onStale = vi.fn()
    const { result } = renderHook(() => useCities(9999, { onStale }), { wrapper })
    await waitFor(() => expect(onStale).toHaveBeenCalledOnce())
    // The API's sentence is not for the visitor: the hook says nothing but «reset».
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(calls('transportation/province/list/')).toHaveLength(2))
    expect(client.getQueryData(['geo', 'cities', TEHRAN.id])).toBeUndefined()
  })
})
