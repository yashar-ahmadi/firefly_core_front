'use client'

import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, isSessionQuery } from '@/lib/session/viewer-queries'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'

export interface AccountQueryOptions<T> {
  /**
   * Under a key `clearViewerQueries` removes (`SESSION_QUERIES`): the data is the visitor's. Any
   * other key is refused outside production (it would outlive a logout).
   */
  queryKey: QueryKey
  queryFn: (context: { signal: AbortSignal }) => Promise<T>
  /** A paged list keeps showing its last page while the next loads (`keepPreviousData`). */
  placeholderData?: UseQueryOptions<T, Error, T, QueryKey>['placeholderData']
  /** Read only while this holds too (it never reads without a session either). */
  enabled?: boolean
  /** What the server read for the page's first render (fresh for the stale time). */
  initialData?: T
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
  placeholderData,
  enabled = true,
  initialData,
}: AccountQueryOptions<T>): UseQueryResult<T> {
  if (process.env.NODE_ENV !== 'production' && !isSessionQuery(queryKey)) {
    throw new Error(
      `useAccountQuery: ${JSON.stringify(queryKey)} is under no SESSION_QUERIES prefix ` +
        '(src/lib/session/viewer-queries.ts): a logout would leave it for the next visitor.',
    )
  }
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const read = withSessionExpiry(queryFn, expire)
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => read({ signal }),
    enabled: hasSession && enabled,
    placeholderData,
    ...(initialData === undefined ? {} : { initialData }),
  })
}

/** Whether a section shows its skeleton: still loading, or the session just ended (see above). */
export function isLoadingSection(query: Pick<UseQueryResult<unknown>, 'isPending' | 'error'>) {
  return query.isPending || isSessionExpiredError(query.error)
}
