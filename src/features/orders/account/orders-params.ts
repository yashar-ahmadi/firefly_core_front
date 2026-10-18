import type { QueryInit } from '@/lib/api/envelope'
import type { OrderSort } from '@/lib/api/types/order-detail'
import { pageEntry, parsePage, toSearch } from '@/features/account/lists/page-param'
import { STATUS_GROUPS } from '../order-statuses'

// «سفارش‌های من»'s URL state (`?group=in_progress&sort=total-desc&search=…&page=2`, defaults left
// out) and the API query it makes (order digest §3.1.2). `group` is the API's `status_group`: the
// dashboard's strip and the checkout's unpaid-limit link already link to `?group=<key>`. Nothing
// the API would refuse is ever sent: an unknown sort is the default (`invalid_choice`), and a
// group only when the code knows it or the summary lists it (`order_status_group_filter_unknown`).
// Pure.

export interface OrdersParams {
  /** A group key from the URL (its shape checked), or null for every order. */
  group: string | null
  sort: OrderSort
  /** An order code's start, a full postal tracking code or words of a product's name. */
  search: string
  page: number
}

export const DEFAULT_ORDER_SORT: OrderSort = 'date-desc'

/** The four sorts the API takes, default first. */
export const ORDER_SORTS: readonly { value: OrderSort; label: string }[] = [
  { value: 'date-desc', label: 'جدیدترین' },
  { value: 'date-asc', label: 'قدیمی\u{200C}ترین' },
  { value: 'total-desc', label: 'بیشترین مبلغ' },
  { value: 'total-asc', label: 'کمترین مبلغ' },
]

/** The longest search kept (the API matches a code's start, a tracking code or words). */
export const SEARCH_MAX = 100

/** The groups the code knows (the API's five today), sent before the summary is read. */
const KNOWN_GROUPS: ReadonlySet<string> = new Set(Object.values(STATUS_GROUPS))
const GROUP_KEY = /^[a-z][a-z_]{0,39}$/

export function isOrderSort(value: unknown): value is OrderSort {
  return ORDER_SORTS.some((sort) => sort.value === value)
}

type Search = Pick<URLSearchParams, 'get'>

export function parseOrdersParams(search: Search): OrdersParams {
  const group = search.get('group') ?? ''
  const sort = search.get('sort')
  return {
    group: GROUP_KEY.test(group) ? group : null,
    sort: isOrderSort(sort) ? sort : DEFAULT_ORDER_SORT,
    search: (search.get('search') ?? '').trim().slice(0, SEARCH_MAX),
    page: parsePage(search.get('page')),
  }
}

/** The URL's query for `params`: `?group=…&sort=…&search=…&page=…`, defaults left out. */
export function ordersSearch({ group, sort, search, page }: OrdersParams): string {
  const entries: [string, string][] = []
  if (group) entries.push(['group', group])
  if (sort !== DEFAULT_ORDER_SORT) entries.push(['sort', sort])
  if (search) entries.push(['search', search])
  return toSearch([...entries, ...pageEntry(page)])
}

export type ResolvedGroup =
  | { kind: 'all' }
  | { kind: 'group'; key: string }
  /** A key the code does not know: the summary will say whether it is a tab. */
  | { kind: 'pending' }

/**
 * The group the list is filtered by. `summaryGroups`: the summary's keys, undefined while it is
 * read, null when it could not be. A key neither knows falls back to every order.
 */
export function resolveGroup(
  group: string | null,
  summaryGroups: readonly string[] | null | undefined,
): ResolvedGroup {
  if (group === null) return { kind: 'all' }
  if (KNOWN_GROUPS.has(group)) return { kind: 'group', key: group }
  if (summaryGroups === undefined) return { kind: 'pending' }
  return summaryGroups?.includes(group) ? { kind: 'group', key: group } : { kind: 'all' }
}

/** `GET order/list/`'s query: the API's own names, nothing for a default. */
export function ordersApiQuery(
  { sort, search, page }: OrdersParams,
  group: Exclude<ResolvedGroup, { kind: 'pending' }>,
): QueryInit {
  return {
    ...(group.kind === 'group' ? { status_group: group.key } : {}),
    ...(sort === DEFAULT_ORDER_SORT ? {} : { sort }),
    ...(search ? { search } : {}),
    ...(page > 1 ? { page } : {}),
  }
}
