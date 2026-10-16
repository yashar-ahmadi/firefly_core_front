/**
 * Listing state in the browser URL, using the API's own parameter names (product digest §3.8.1,
 * §6.4). Pure: used by Server Components and by the client-side filter UI alike.
 */
import { isSortValue, type SortValue } from '@/lib/api/types/catalog'
import { toLatinDigits } from '@/lib/format'

/** A `GET product/list/` query. Lists are sent comma-separated. */
export type ListingApiQuery = {
  search?: string
  category?: string
  brand?: string[]
  attribute_values?: number[]
  min_price?: number
  max_price?: number
  in_stock?: boolean
  is_special?: boolean
  has_discount?: boolean
  special_first?: boolean
  sort?: SortValue
  page?: number
  limit?: number
  list?: string
}

/**
 * The entity a listing route is about. Pass each slug as text, as the API returns it (for example
 * `category.slug` from `getCategory`): the values are sent as given.
 */
export type ListingContext = { category?: string; brand?: string; list?: string }

type RawParams = Record<string, string | string[] | undefined>

const BOOLEAN_KEYS = ['in_stock', 'is_special', 'has_discount', 'special_first'] as const
const CONTEXT_KEYS = [
  'category',
  'brand',
  'list',
] as const satisfies readonly (keyof ListingContext)[]

/** The raw limit of `search/`; the list endpoint only uses the first 8 words anyway. */
const MAX_SEARCH_LENGTH = 200
/** Bounds the API URL a hand-made link can produce. */
const MAX_LIST_ENTRIES = 50
/** Longer category, list or brand slugs are dropped: cut short, they would name another one. */
const MAX_SLUG_LENGTH = 200
/** The API refuses any value holding U+0000 (400 `null_characters_not_allowed`). */
const NUL = '\u{0}'

/** The first string of a scalar parameter (a repeated key arrives as an array). */
function first(value: unknown): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item : undefined
}

/** Trimmed; undefined when blank or when it holds U+0000. */
function clean(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed !== '' && !trimmed.includes(NUL) ? trimmed : undefined
}

function text(value: unknown): string | undefined {
  const item = first(value)
  return item === undefined ? undefined : clean(item)
}

/** Every clean comma-separated entry, across repeated keys. */
function entries(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value]
  return items
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.split(','))
    .map(clean)
    .filter((entry): entry is string => entry !== undefined)
}

function isSlugSized(value: string): boolean {
  return Array.from(value).length <= MAX_SLUG_LENGTH
}

function slug(value: string | undefined): string | undefined {
  return value !== undefined && isSlugSized(value) ? value : undefined
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)].slice(0, MAX_LIST_ENTRIES)
}

/** A non-negative safe integer in Latin, Persian or Arabic-Indic digits; anything else is undefined. */
function integer(raw: string | undefined): number | undefined {
  const digits = toLatinDigits(raw?.trim() ?? '')
  if (!/^\d+$/.test(digits)) return undefined
  const value = Number(digits)
  return Number.isSafeInteger(value) ? value : undefined
}

/** `true`/`false`/`1`/`0`, case-insensitively, as the API accepts; anything else is undefined. */
function flag(value: unknown): boolean | undefined {
  const raw = toLatinDigits(first(value)?.trim().toLowerCase() ?? '')
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

/**
 * Read a listing query from Next `searchParams`. Never throws: unknown keys (`limit` included, the
 * page size being the store setting) and invalid values are dropped, so the API never answers 400.
 * - Values holding U+0000 are dropped, and so are category, list and brand slugs over 200
 *   characters; the search term is cut to 200.
 * - `brand` and `attribute_values` are comma-separated; repeated keys are merged, duplicates dropped.
 * - Prices and `page` must be non-negative integers (Persian digits allowed); `page < 1` is dropped.
 * - Booleans are `true`/`false`/`1`/`0`; `sort` must be one of `SORT_VALUES`.
 * - The route context wins: each key present in `opts.context` replaces the URL value (`brand`
 *   becomes `[context.brand]`); the other keys stay URL filters, so `?brand=apple` still filters a
 *   category page and `?category=…` a brand page. Without a context (the generic listing) all three
 *   come from the URL.
 */
export function parseListingParams(
  sp: RawParams,
  opts: { context?: ListingContext } = {},
): ListingApiQuery {
  const query: ListingApiQuery = {}

  const search = text(sp.search)
  if (search) query.search = Array.from(search).slice(0, MAX_SEARCH_LENGTH).join('')

  const category = slug(text(sp.category))
  if (category) query.category = category
  const brand = unique(entries(sp.brand).filter(isSlugSized))
  if (brand.length > 0) query.brand = brand
  const list = slug(text(sp.list))
  if (list) query.list = list

  const context = opts.context ?? {}
  if (context.category !== undefined) query.category = context.category
  if (context.brand !== undefined) query.brand = [context.brand]
  if (context.list !== undefined) query.list = context.list

  const ids = unique(
    entries(sp.attribute_values)
      .map(integer)
      .filter((id): id is number => id !== undefined && id > 0),
  )
  if (ids.length > 0) query.attribute_values = ids

  const minPrice = integer(first(sp.min_price))
  if (minPrice !== undefined) query.min_price = minPrice
  const maxPrice = integer(first(sp.max_price))
  if (maxPrice !== undefined) query.max_price = maxPrice

  for (const key of BOOLEAN_KEYS) {
    const value = flag(sp[key])
    if (value !== undefined) query[key] = value
  }

  const sort = first(sp.sort)
  if (isSortValue(sort)) query.sort = sort

  const page = integer(first(sp.page))
  if (page !== undefined && page >= 1) query.page = page

  return query
}

/**
 * The query without the keys the route context supplies: what the browser URL holds on that
 * route. The filter UI writes these back to the URL, never the context's own keys.
 */
export function withoutContext(q: ListingApiQuery, context: ListingContext): ListingApiQuery {
  const rest = { ...q }
  for (const key of CONTEXT_KEYS) {
    if (context[key] !== undefined) delete rest[key]
  }
  return rest
}

function count(value: number | undefined): string | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : undefined
}

function positive(value: number | undefined): string | undefined {
  return value !== undefined && value >= 1 ? count(value) : undefined
}

/**
 * Serialise a listing query, keys in sorted order so equal queries give equal URLs (and equal
 * Data Cache keys). Omits empty values and the API defaults `page=1` and `special_first=true`.
 * `sort=date-desc` is kept: a category or list page may default to another sort.
 */
export function toSearchParams(q: ListingApiQuery): URLSearchParams {
  const pairs: [string, string | undefined][] = [
    ['search', q.search],
    ['category', q.category],
    ['brand', q.brand?.join(',')],
    ['list', q.list],
    ['attribute_values', q.attribute_values?.map(positive).filter(Boolean).join(',')],
    ['min_price', count(q.min_price)],
    ['max_price', count(q.max_price)],
    ['sort', isSortValue(q.sort) ? q.sort : undefined],
    ['page', q.page === 1 ? undefined : positive(q.page)],
    ['limit', positive(q.limit)],
  ]
  for (const key of BOOLEAN_KEYS) {
    const value = q[key]
    const isDefault = key === 'special_first' && value === true
    if (typeof value === 'boolean' && !isDefault) pairs.push([key, String(value)])
  }
  const kept = pairs.filter((pair): pair is [string, string] => Boolean(pair[1]))
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new URLSearchParams(kept)
}

/** A listing URL: `basePath` (with its trailing slash) plus the query, or the bare path. */
export function listingHref(basePath: string, q: ListingApiQuery): string {
  const search = toSearchParams(q).toString()
  return search ? `${basePath}?${search}` : basePath
}
