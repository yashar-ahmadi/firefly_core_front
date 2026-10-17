'use client'

import { useUnreadCount } from './use-notifications'

/**
 * Keeps the unread count (`useUnreadCount`) on every account page: the account shell mounts it,
 * so the navigation's «اعلان‌ها» badge and the header's dot show it without a visit to the inbox.
 * The inbox observes the same query (one key, one scan). Never on the catalog's pages: each count
 * is a scan of the list, from the visitor's request budget. Renders nothing.
 */
export function UnreadCount(): null {
  useUnreadCount()
  return null
}
