'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Province } from '@/lib/api/types/geo'
import { GEO_STALE_TIME, geoApi, PROVINCES_KEY } from './api'

/** Every province (key `['geo','provinces']`), in the API's Persian alphabetical order. */
export function useProvinces(): UseQueryResult<Province[]> {
  return useQuery({
    queryKey: PROVINCES_KEY,
    queryFn: ({ signal }) => geoApi.provinces(signal),
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_STALE_TIME,
  })
}
