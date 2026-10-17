import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { NotificationItem } from '@/lib/api/types/notification'

// The inbox's API (dashboard digest §4.1–4.2), through the BFF. No unread endpoint, no filter, no
// mark-all, no delete: the unread count is the list paged through. Pure (no React).

export type NotificationsPage = Paginated<NotificationItem>

/** The inbox page («اعلان‌ها»): where a notification click in the system tray leads. */
export const NOTIFICATIONS_PATH = '/account/notifications/'

/** The inbox's pages (`useNotifications`), under `['notifications']` (logout removes it). */
export const NOTIFICATIONS_KEY = ['notifications', 'list'] as const

/** The inbox's page size. */
export const PAGE_SIZE = 20
/** The unread count reads the largest pages the API serves. */
export const SCAN_PAGE_SIZE = 100
/**
 * At most this many pages per count (2,000 notifications): a count costs the visitor's own
 * request budget (5,000 an hour), and polls. Past it, the count is what was found.
 */
export const SCAN_PAGE_CAP = 20

export async function fetchNotifications(
  page: number,
  signal?: AbortSignal,
  limit = PAGE_SIZE,
): Promise<NotificationsPage> {
  const query = page > 1 ? { page, limit } : { limit }
  const { data } = await bffFetch<NotificationsPage>('notification/list/', { query, signal })
  return data
}

/** The unread notifications' ids: `limit=100` pages until `next` is null (or the cap). */
export async function fetchUnreadIds(signal?: AbortSignal): Promise<number[]> {
  // A set: a notification created meanwhile shifts the pages, so one can be read twice.
  const ids = new Set<number>()
  for (let page = 1; page <= SCAN_PAGE_CAP; page += 1) {
    const { results, next } = await fetchNotifications(page, signal, SCAN_PAGE_SIZE)
    for (const item of results) if (!item.is_read) ids.add(item.id)
    if (next === null) break
  }
  return [...ids]
}

/** `POST notification/<id>/read/`: idempotent; a 404 means it is gone (or never was the visitor's). */
export async function markNotificationRead(id: number, signal?: AbortSignal): Promise<void> {
  await bffFetch<Record<string, never>>(`notification/${id}/read/`, { method: 'POST', signal })
}
