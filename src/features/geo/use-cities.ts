'use client'

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'
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
  // Once per failed read (its time), whatever the caller does: a caller that keeps the stale
  // province and passes a new callback each render is told once, and the lists read once.
  const staleAt = isStaleProvinceError(query.error) ? query.errorUpdatedAt : 0
  const tell = useEffectEvent(() => onStale?.())
  useEffect(() => {
    if (!staleAt) return
    refreshGeo(client)
    tell()
  }, [staleAt, client])
  return query
}
