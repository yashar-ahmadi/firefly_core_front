'use client'

import { hashKey, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { useSession } from '@/lib/session/session-context'

/**
 * Where the account area keeps the number of unread notifications: `useUnreadCount` (mounted by
 * the account shell and the inbox) computes and polls it under this key. The header's menu and
 * the account navigation only read what is there: no request, no polling and no query observer
 * of their own (an observer would also lend the count's query its options). On the catalog's
 * pages it is what the last account page counted, if any.
 */
export const UNREAD_NOTIFICATIONS_KEY = ['notifications', 'unread'] as const

const UNREAD_HASH = hashKey(UNREAD_NOTIFICATIONS_KEY)

/**
 * The number of unread notifications the account area counted (the account navigation's badge),
 * or undefined until it has: the API has no unread endpoint (digest §4.1), so only a scan of the
 * list (`useUnreadCount`) can count them.
 */
export function useUnreadNotificationCount(): number | undefined {
  const { hasSession } = useSession()
  const client = useQueryClient()
  const subscribe = useCallback(
    (onChange: () => void) =>
      client.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === UNREAD_HASH) onChange()
      }),
    [client],
  )
  const count = useSyncExternalStore(
    subscribe,
    () => client.getQueryData<number>(UNREAD_NOTIFICATIONS_KEY),
    () => undefined,
  )
  return hasSession && typeof count === 'number' ? count : undefined
}

/** Whether the signed-in visitor has unread notifications, as far as the account area knows. */
export function useHasUnreadNotifications(): boolean {
  const count = useUnreadNotificationCount()
  return count !== undefined && count > 0
}
