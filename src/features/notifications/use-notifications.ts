'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import {
  fetchNotifications,
  fetchUnreadIds,
  NOTIFICATIONS_KEY,
  type NotificationsPage,
} from './notifications-api'
import { UNREAD_NOTIFICATIONS_KEY } from './unread'

/** How often the unread count is read again while the tab is in view. */
export const UNREAD_POLL_MS = 5 * 60_000

/**
 * A session-only read: a 401 that means the session is gone ends it (`useSessionExpired`: the
 * page stops asking and login replaces it, once however many reads fail) and stays the error.
 */
function useSessionRead<A extends unknown[], T>(read: (...args: A) => Promise<T>) {
  const expire = useSessionExpired()
  return async (...args: A): Promise<T> => {
    try {
      return await read(...args)
    } catch (error) {
      if (isSessionExpiredError(error)) expire()
      throw error
    }
  }
}

/**
 * The inbox (`GET notification/list/`, digest §4.2): the visitor's own notifications and every
 * broadcast, newest first, 20 at a time («نمایش بیشتر» reads the next page). Only with a session;
 * under `['notifications']`, which logout removes.
 */
export function useNotifications() {
  const { hasSession } = useSession()
  const read = useSessionRead(fetchNotifications)
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam, signal }) => read(pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last: NotificationsPage) =>
      last.current_page < last.total_pages ? last.current_page + 1 : undefined,
    enabled: hasSession,
  })
}

/**
 * The number of unread notifications (`UNREAD_NOTIFICATIONS_KEY`, which the header's menu and the
 * account navigation read without asking themselves): the API has no unread count, so the list
 * is paged through (`limit=100` until `next` is null, at most 20 pages) and `is_read: false`
 * counted. Read again every 5 minutes while the tab is in view, never while it is hidden. Mount
 * it on the inbox only: every count costs requests from the visitor's budget.
 */
export function useUnreadCount() {
  const { hasSession } = useSession()
  const read = useSessionRead(async (signal: AbortSignal) => (await fetchUnreadIds(signal)).length)
  return useQuery({
    queryKey: UNREAD_NOTIFICATIONS_KEY,
    queryFn: ({ signal }) => read(signal),
    enabled: hasSession,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
  })
}
