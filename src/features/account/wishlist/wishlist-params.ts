import type { QueryInit } from '@/lib/api/envelope'
import type { WishlistSort } from '@/lib/api/types/catalog'
import { pageEntry, parsePage, toSearch } from '../lists/page-param'

// The wishlist page's URL state (`?sort=added-asc&in_stock=true&page=2`, defaults left out) and
// the API query it makes (product digest §3.15). Pure.

export interface WishlistParams {
  sort: WishlistSort
  /** «فقط کالاهای موجود» (`in_stock=true`). */
  inStock: boolean
  page: number
}

export const DEFAULT_WISHLIST_SORT: WishlistSort = 'added-desc'

/** The two sorts the API takes (anything else is a 400), with their labels, default first. */
export const WISHLIST_SORTS: readonly { value: WishlistSort; label: string }[] = [
  { value: 'added-desc', label: 'جدیدترین' },
  { value: 'added-asc', label: 'قدیمی‌ترین' },
]

export function isWishlistSort(value: unknown): value is WishlistSort {
  return WISHLIST_SORTS.some((sort) => sort.value === value)
}

type Search = Pick<URLSearchParams, 'get'>

/** The URL's state; an unknown value is the default (never sent: the API would refuse it). */
export function parseWishlistParams(search: Search): WishlistParams {
  const sort = search.get('sort')
  return {
    sort: isWishlistSort(sort) ? sort : DEFAULT_WISHLIST_SORT,
    inStock: search.get('in_stock') === 'true',
    page: parsePage(search.get('page')),
  }
}

/** The URL's query for `params`: `?sort=…&in_stock=true&page=…`, defaults left out. */
export function wishlistSearch({ sort, inStock, page }: WishlistParams): string {
  return toSearch([
    ...(sort === DEFAULT_WISHLIST_SORT ? [] : [['sort', sort] as [string, string]]),
    ...(inStock ? [['in_stock', 'true'] as [string, string]] : []),
    ...pageEntry(page),
  ])
}

/** `GET product/wishlist/list/`'s query: the API's own names, nothing for a default. */
export function wishlistApiQuery({ sort, inStock, page }: WishlistParams): QueryInit {
  return {
    ...(sort === DEFAULT_WISHLIST_SORT ? {} : { sort }),
    ...(inStock ? { in_stock: 'true' } : {}),
    ...(page > 1 ? { page } : {}),
  }
}
