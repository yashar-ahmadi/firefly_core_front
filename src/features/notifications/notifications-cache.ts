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

const KEYS: readonly QueryKey[] = [NOTIFICATIONS_KEY, UNREAD_NOTIFICATIONS_KEY]

const noop = () => undefined

interface Landing {
  /** Settles once the page is in the cache, whether it came or failed. */
  settled: Promise<void>
  /** What to write again over it then, each once. */
  redos: Set<() => void>
}

/** Per «نمایش بیشتر» fetch (its promise): when it has landed and what to write again then. */
const landings = new WeakMap<Promise<unknown>, Landing>()

/**
 * «نمایش بیشتر»'s page on its way (null when none is). It cannot be stopped without losing it, nor
 * read again under it (a read again replaces it, the page dropped); and it lands with the pages as
 * they were when it left, over anything written meanwhile.
 */
function moreLanding(client: QueryClient): Landing | null {
  const query = client.getQueryCache().find({ queryKey: NOTIFICATIONS_KEY, exact: true })
  const promise = query?.promise
  if (!query || !promise || query.state.fetchStatus !== 'fetching') return null
  if (!(query.state.fetchMeta as { fetchMore?: unknown } | null)?.fetchMore) return null
  let landing = landings.get(promise)
  if (!landing) {
    // One tick more: the page is in the cache by then, whatever order the query's own steps take.
    const settled = promise.then(noop, noop).then(noop)
    const redos = new Set<() => void>()
    void settled.then(() => redos.forEach((redo) => redo()))
    landing = { settled, redos }
    landings.set(promise, landing)
  }
  return landing
}

/** What `holdInboxReads` returns: call it once the write settled. */
export type ResumeInboxReads = (options?: {
  /** Read the inbox and the count again (a row went): once, whatever was held. */
  refresh?: boolean
}) => void

/**
 * Before a read is written on screen: the inbox's and the count's reads on their way, whose
 * answers left before the write and would put the row back as unread. A read again of data on
 * screen is stopped now; the count's first read (it would be left with nothing until the next
 * poll) is left to land, and so is «نمایش بیشتر»'s page (it would be lost): `redo` writes the
 * write's change again once that page landed (it carries the pages from before the write). Returns
 * what to call once the write settled: the reads stopped or left to land run again, with the
 * write in them (all of both with `refresh`, once each).
 */
export async function holdInboxReads(
  client: QueryClient,
  redo?: () => void,
): Promise<ResumeInboxReads> {
  const stopped: QueryKey[] = []
  const landing: QueryKey[] = []
  const more = moreLanding(client)
  if (more && redo) more.redos.add(redo)
  for (const queryKey of KEYS) {
    const state = client.getQueryState(queryKey)
    if (state?.fetchStatus !== 'fetching') continue
    if (queryKey === NOTIFICATIONS_KEY && more) continue
    if (state.data === undefined) {
      landing.push(queryKey)
      continue
    }
    stopped.push(queryKey)
    await client.cancelQueries({ queryKey })
  }
  return ({ refresh = false } = {}) => {
    for (const queryKey of refresh ? KEYS : stopped) {
      if (landing.includes(queryKey)) continue
      if (queryKey === NOTIFICATIONS_KEY) void refreshList(client)
      else void client.invalidateQueries({ queryKey })
    }
    // A read with no data yet cannot be restarted (a new one joins it): once it landed.
    for (const queryKey of landing) {
      void client.refetchQueries({ queryKey }).then(() => client.invalidateQueries({ queryKey }))
    }
  }
}

/** Reads the inbox's pages again, once «نمایش بیشتر»'s page on its way (if any) has landed. */
function refreshList(client: QueryClient): Promise<unknown> {
  const invalidate = () => client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  const more = moreLanding(client)
  return more ? more.settled.then(invalidate) : invalidate()
}

/** Reads the inbox and the count again (after a row went, or after «علامت‌گذاری همه»). */
export function refreshInbox(client: QueryClient): Promise<unknown> {
  return Promise.all([
    refreshList(client),
    client.invalidateQueries({ queryKey: UNREAD_NOTIFICATIONS_KEY }),
  ])
}
