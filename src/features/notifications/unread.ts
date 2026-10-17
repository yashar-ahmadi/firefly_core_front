'use client'

import { hashKey, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { useSession } from '@/lib/session/session-context'

/**
 * Where the notifications inbox (Plan 3 Task 9) keeps the number of unread notifications: its
 * own query under this key computes and polls it. The header's menu and the account navigation
 * only read what is there: no request, no polling and no query observer of their own (an observer
 * would also lend the inbox's query its options).
 */
export const UNREAD_NOTIFICATIONS_KEY = ['notifications', 'unread'] as const

const UNREAD_HASH = hashKey(UNREAD_NOTIFICATIONS_KEY)

/**
 * The number of unread notifications the inbox counted (the account navigation's badge), or
 * undefined until it has: the API has no unread endpoint (digest §4.1), so only the inbox, which
 * pages through the list, can count them.
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

/** Whether the signed-in visitor has unread notifications, as far as the inbox knows. */
export function useHasUnreadNotifications(): boolean {
  const count = useUnreadNotificationCount()
  return count !== undefined && count > 0
}
