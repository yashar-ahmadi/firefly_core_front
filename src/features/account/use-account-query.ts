'use client'

import { useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

export interface AccountQueryOptions<T> {
  /** Under a key `clearViewerQueries` removes (`SESSION_QUERIES`): the data is the visitor's. */
  queryKey: QueryKey
  queryFn: (context: { signal: AbortSignal }) => Promise<T>
}

/**
 * A read of the account area through the BFF, only with a session (never cached anywhere but
 * this tab's QueryClient). A 401 that means the session is gone ends it (`useSessionExpired`:
 * the page stops asking, and login replaces the account page, with it as `next`, once however
 * many reads fail together) and stays the query's error: a section keeps its skeleton for it
 * (`isSessionExpiredError`) while the page goes, instead of flashing an error.
 */
export function useAccountQuery<T>({
  queryKey,
  queryFn,
}: AccountQueryOptions<T>): UseQueryResult<T> {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await queryFn({ signal })
      } catch (error) {
        if (isSessionExpiredError(error)) expire()
        throw error
      }
    },
    enabled: hasSession,
  })
}

/** Whether a section shows its skeleton: still loading, or the session just ended (see above). */
export function isLoadingSection(query: Pick<UseQueryResult<unknown>, 'isPending' | 'error'>) {
  return query.isPending || isSessionExpiredError(query.error)
}
