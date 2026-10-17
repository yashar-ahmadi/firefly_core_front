'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { UserProfile } from '@/lib/api/types/account'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, ME_KEY } from '@/lib/session/viewer-queries'
import { fetchProfile } from './profile-api'

export { ME_KEY }

/**
 * The signed-in visitor's profile (`GET account/profile/me/`, key `['me']`), read only with a
 * session. A 401 that means the session is gone resolves to null and ends the session
 * (`useSessionExpired`: no session, viewer data dropped, login when the page needs it); with no
 * session left, nothing asks again. Other failures are errors, retried as usual.
 */
export function useMe(): UseQueryResult<UserProfile | null> {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ signal }): Promise<UserProfile | null> => {
      try {
        return await fetchProfile({ signal })
      } catch (error) {
        if (!isSessionExpiredError(error)) throw error
        expire()
        return null
      }
    },
    enabled: hasSession,
  })
}
