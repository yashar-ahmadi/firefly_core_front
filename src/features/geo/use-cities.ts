'use client'

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { City } from '@/lib/api/types/geo'
import { citiesKey, GEO_STALE_TIME, geoApi, isStaleProvinceError, refreshGeo } from './api'

export interface CitiesOptions {
  /**
   * The province id is no longer the API's (`invalid_choice`): the lists read again, and the
   * caller resets the province and the city (no message: the visitor did nothing wrong).
   */
  onStale?: () => void
}

/**
 * The cities of `province` (key `['geo','cities', id]`), none before a province is chosen. A
 * change of province shows that province's list only: nothing of the last one meanwhile.
 */
export function useCities(
  province: number | null,
  { onStale }: CitiesOptions = {},
): UseQueryResult<City[]> {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: citiesKey(province),
    queryFn: ({ signal }) => geoApi.cities(province!, signal),
    enabled: province !== null,
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_STALE_TIME,
  })
  const stale = isStaleProvinceError(query.error)
  useEffect(() => {
    if (!stale) return
    refreshGeo(client)
    onStale?.()
  }, [stale, client, onStale])
  return query
}
