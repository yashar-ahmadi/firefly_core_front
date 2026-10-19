import type { QueryInit } from '@/lib/api/envelope'
import type { BlogCategoryListItem } from '@/lib/api/types/blog'
import { pageEntry, parsePage, toSearch } from '../lists/page-param'

// The reading list page's URL state (`?search=…&category=…&sort=added-asc&page=2`, defaults left
// out) and the API query it makes (blog digest §1.8, dashboard digest §3.3). Pure.

export type ReadingListSort = 'added-desc' | 'added-asc'

export interface ReadingListParams {
  /** Words of a post's title or text (the post list's own search). */
  search: string
  /** A blog category's slug (its descendants' posts too); null for all. */
  category: string | null
  sort: ReadingListSort
  page: number
}

export const DEFAULT_READING_LIST_SORT: ReadingListSort = 'added-desc'

/** The two sorts the API takes (anything else is a 400), with their labels, default first. */
export const READING_LIST_SORTS: readonly { value: ReadingListSort; label: string }[] = [
  { value: 'added-desc', label: 'جدیدترین' },
  { value: 'added-asc', label: 'قدیمی\u{200C}ترین' },
]

export const SEARCH_MAX = 100
/** Posts a page: four rows of three. */
export const READING_LIST_PAGE_SIZE = 12
const SLUG = /^[^/?#\s]{1,100}$/u

export function isReadingListSort(value: unknown): value is ReadingListSort {
  return READING_LIST_SORTS.some((sort) => sort.value === value)
}

type Search = Pick<URLSearchParams, 'get'>

/** The URL's state; an unknown sort or a malformed slug is the default (never sent). */
export function parseReadingListParams(search: Search): ReadingListParams {
  const sort = search.get('sort')
  const category = search.get('category')?.trim() ?? ''
  return {
    search: (search.get('search') ?? '').trim().slice(0, SEARCH_MAX),
    category: SLUG.test(category) ? category : null,
    sort: isReadingListSort(sort) ? sort : DEFAULT_READING_LIST_SORT,
    page: parsePage(search.get('page')),
  }
}

/** The URL's query for `params`, defaults left out. */
export function readingListSearch({ search, category, sort, page }: ReadingListParams): string {
  return toSearch([
    ...(search ? [['search', search] as [string, string]] : []),
    ...(category ? [['category', category] as [string, string]] : []),
    ...(sort === DEFAULT_READING_LIST_SORT ? [] : [['sort', sort] as [string, string]]),
    ...pageEntry(page),
  ])
}

/** `GET blog/reading-list/list/`'s query: the API's own names, nothing for a default. */
export function readingListApiQuery({
  search,
  category,
  sort,
  page,
}: ReadingListParams): QueryInit {
  return {
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
    ...(sort === DEFAULT_READING_LIST_SORT ? {} : { sort }),
    ...(page > 1 ? { page } : {}),
    limit: READING_LIST_PAGE_SIZE,
  }
}

export interface CategoryOption {
  value: string
  label: string
}

/**
 * The category filter's options, from the blog's published categories (tree pre-order): by slug
 * (the API's `category`), a child indented under its parent.
 */
export function categoryOptions(list: readonly BlogCategoryListItem[]): CategoryOption[] {
  const depth = new Map<number, number>()
  return list.map((category) => {
    const level = category.parent_id === null ? 0 : (depth.get(category.parent_id) ?? -1) + 1
    depth.set(category.id, level)
    return { value: category.slug, label: `${'\u{2003}'.repeat(level)}${category.name}` }
  })
}
