import type { QueryClient } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'

// Provinces and cities (cart digest §8): public lists, read through the BFF like the other
// public reads of the browser. Ids come from these lists only, never from code.

/** Everything geographic in the cache: the provinces and each province's cities. */
export const GEO_KEY = ['geo'] as const
export const PROVINCES_KEY = ['geo', 'provinces'] as const
const CITIES_KEY = ['geo', 'cities'] as const
export const citiesKey = (province: number | null) => [...CITIES_KEY, province] as const

/** The lists change when an operator edits them, which is rare: fresh for a day. */
export const GEO_STALE_TIME = 24 * 60 * 60_000

/** The API's largest page (OpenAPI says 100; it is 1500): the national table in one request. */
const PAGE_SIZE = 1500
/** Stops a list that never ends: 20 pages of 1500 is far past Iran's 1,110 cities. */
const MAX_PAGES = 20

/** Every page of a list: `total_pages` says when to stop, whatever page size the API used. */
async function readAll<T>(
  path: string,
  query: Record<string, number>,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await bffFetch<Paginated<T>>(path, {
      query: { ...query, limit: PAGE_SIZE, page },
      signal,
    })
    items.push(...data.results)
    if (page >= data.total_pages) break
  }
  return items
}

export const geoApi = {
  provinces: (signal?: AbortSignal): Promise<Province[]> =>
    readAll<Province>('transportation/province/list/', {}, signal),
  cities: (province: number, signal?: AbortSignal): Promise<City[]> =>
    readAll<City>('transportation/city/list/', { province }, signal),
}

/** A province id the API no longer knows (`invalid_choice` on the city list's `province`). */
export function isStaleProvinceError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.errors.some((item) => item.code === 'invalid_choice' && item.attr === 'province')
  )
}

/**
 * The cached lists are out of date (a stale province id, or an address write that answered
 * `does_not_exist` for a province or a city): the cities of other provinces go (read again when
 * asked), the provinces and the lists on screen read again. The caller resets the choice. A list
 * that failed for its stale province id is not asked again (it would fail the same way).
 */
export function refreshGeo(client: QueryClient): void {
  client.removeQueries({ queryKey: CITIES_KEY, type: 'inactive' })
  void client.invalidateQueries({
    queryKey: GEO_KEY,
    predicate: (query) => !isStaleProvinceError(query.state.error),
  })
}
