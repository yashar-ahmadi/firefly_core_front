import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import type { FeatureKey } from '@/lib/api/types/common'

/** Data younger than this is fresh: no refetch on mount. */
export const QUERY_STALE_TIME = 30_000
const MAX_RETRIES = 2

/**
 * Retry a failed query at most twice, except when trying again cannot help: a client error
 * (4xx: bad input, auth, not found, rate limit) or a switched-off feature. Server errors and lost
 * connections (`status` 0) are retried.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.isFeatureDisabled()) return false
    if (error.status >= 400 && error.status < 500) return false
  }
  return failureCount < MAX_RETRIES
}

export interface QueryClientOptions {
  /** Called for every failed query or mutation that answered `503 feature_disabled`. */
  onFeatureDisabled?: (feature: FeatureKey, reason: string) => void
}

/** The storefront's QueryClient. Create one per browser session (src/app/providers.tsx). */
export function createQueryClient({ onFeatureDisabled }: QueryClientOptions = {}): QueryClient {
  const onError = (error: unknown) => {
    // A `feature_disabled` error without a known feature key has no switch to turn off.
    if (error instanceof ApiError && error.isFeatureDisabled() && error.feature) {
      onFeatureDisabled?.(error.feature, error.detail)
    }
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
      },
    },
  })
}
