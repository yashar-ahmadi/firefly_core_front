import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
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
 * Before a read is written on screen: the inbox's and the count's reads on their way, whose
 * answers left before the write and would put the row back as unread. A read again of data on
 * screen is stopped now; the count's first read (it would be left with nothing until the next
 * poll) is left to land, and «نمایش بیشتر»'s page (it would be lost) is left alone. Returns what to
 * call once the write settled: the reads stopped or left to land run again, with the write in them.
 */
export async function holdInboxReads(client: QueryClient): Promise<() => void> {
  const stopped: QueryKey[] = []
  const landing: QueryKey[] = []
  for (const queryKey of [NOTIFICATIONS_KEY, UNREAD_NOTIFICATIONS_KEY]) {
    const state = client.getQueryState(queryKey)
    if (state?.fetchStatus !== 'fetching') continue
    if ((state.fetchMeta as { fetchMore?: unknown } | null)?.fetchMore) continue
    if (state.data === undefined) {
      landing.push(queryKey)
      continue
    }
    stopped.push(queryKey)
    await client.cancelQueries({ queryKey })
  }
  return () => {
    for (const queryKey of stopped) void client.invalidateQueries({ queryKey })
    // A read with no data yet cannot be restarted (a new one joins it): once it landed.
    for (const queryKey of landing) {
      void client.refetchQueries({ queryKey }).then(() => client.invalidateQueries({ queryKey }))
    }
  }
}

/** Reads the inbox and the count again (after a row went, or after «علامت‌گذاری همه»). */
export function refreshInbox(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
    client.invalidateQueries({ queryKey: UNREAD_NOTIFICATIONS_KEY }),
  ])
}
