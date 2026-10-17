'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { useAccountQuery } from '../use-account-query'

export { SUMMARY_KEY }

/** `GET dashboard/summary/` through the BFF (with the session). */
export async function fetchSummary({
  signal,
}: { signal?: AbortSignal } = {}): Promise<DashboardSummary> {
  return (await bffFetch<DashboardSummary>('dashboard/summary/', { signal })).data
}

/**
 * The account summary (key `['summary']`): the badges of the account navigation and the
 * dashboard's counters, from one call. Read with a session only; a 401 ends the session
 * (`useAccountQuery`). Fresh for the QueryClient's stale time; writes that change a counter
 * invalidate it.
 */
export function useSummary(): UseQueryResult<DashboardSummary> {
  return useAccountQuery({ queryKey: SUMMARY_KEY, queryFn: fetchSummary })
}
