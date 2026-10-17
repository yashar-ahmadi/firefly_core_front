import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { NOTIFICATIONS_KEY, type NotificationsPage } from './notifications-api'
import { UNREAD_NOTIFICATIONS_KEY } from './unread'

// What a read changes on screen at once, before or without reading the inbox again: the row's
// read state in the inbox's pages and the unread count. Pure (no React).

export type Inbox = InfiniteData<NotificationsPage, number>

function changeRows(
  client: QueryClient,
  change: (rows: NotificationsPage['results']) => NotificationsPage['results'],
): void {
  client.setQueryData<Inbox>(NOTIFICATIONS_KEY, (inbox) =>
    inbox
      ? { ...inbox, pages: inbox.pages.map((page) => ({ ...page, results: change(page.results) })) }
      : inbox,
  )
}

/** `id`'s read state in the inbox's pages: true or false, or null when no page on screen has it. */
export function rowRead(client: QueryClient, id: number): boolean | null {
  const inbox = client.getQueryData<Inbox>(NOTIFICATIONS_KEY)
  for (const page of inbox?.pages ?? []) {
    const row = page.results.find((candidate) => candidate.id === id)
    if (row) return row.is_read
  }
  return null
}

/** Sets `id`'s read state in the inbox's pages. */
export function setRowRead(client: QueryClient, id: number, read: boolean): void {
  changeRows(client, (rows) =>
    rows.map((row) => (row.id === id && row.is_read !== read ? { ...row, is_read: read } : row)),
  )
}

/** `id` out of the inbox's pages (it is gone: deleted by the shop). */
export function dropRow(client: QueryClient, id: number): void {
  changeRows(client, (rows) => rows.filter((row) => row.id !== id))
}

/** The unread count, once it is known, moved by `delta` (never below 0). */
export function shiftUnread(client: QueryClient, delta: number): void {
  client.setQueryData<number>(UNREAD_NOTIFICATIONS_KEY, (count) =>
    count === undefined ? count : Math.max(0, count + delta),
  )
}

/**
 * Stops the inbox's and the count's reads in flight before a change is written over them: an
 * answer that left before the write would put the row back as unread.
 */
export async function holdInboxReads(client: QueryClient): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: NOTIFICATIONS_KEY }),
    client.cancelQueries({ queryKey: UNREAD_NOTIFICATIONS_KEY }),
  ])
}

/** Reads the inbox and the count again (after a row went, or after «علامت‌گذاری همه»). */
export function refreshInbox(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
    client.invalidateQueries({ queryKey: UNREAD_NOTIFICATIONS_KEY }),
  ])
}
