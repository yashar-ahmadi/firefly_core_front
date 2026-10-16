import 'server-only'
import { cache } from 'react'
import {
  toSearchParams,
  type ListingApiQuery,
  type ListingContext,
} from '@/features/catalog/listing-params'
import { ApiError, isApiNotFound } from '@/lib/api/errors'
import { apiFetch, type QueryInit } from '@/lib/api/server'
import type {
  BrandCard,
  BrandDetail,
  CategoryDetail,
  FiltersMetadata,
  HomePage,
  ProductCard,
  ProductDetail,
  ProductListPageDetail,
  ProductSettings,
} from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { normalizeSlug } from '@/lib/url/slug'

/**
 * Server loaders of the public catalog. Every read is anonymous: no token, no cart token and no
 * visitor IP, so one Data Cache entry (and the HTML built from it) serves everyone. `cache()`
 * dedupes the calls within one render (`generateMetadata` plus the page). Tags: the entity tag
 * (`product:`, `category:`, `brand:` or `list:` plus the decoded slug) or `home`, then `catalog`
 * on every read, so `revalidateTag('catalog')` refreshes the whole catalog.
 */

const CATALOG_TAG = 'catalog'
const HOME_REVALIDATE = 60
const PRODUCT_REVALIDATE = 60
const LISTING_REVALIDATE = 60
const ENTITY_REVALIDATE = 300
const SETTINGS_REVALIDATE = 300

const BRAND_PAGE_SIZE = 100
/** A bound on a misbehaving `next` link: 2000 brands. */
const MAX_BRAND_PAGES = 20

const DEFAULT_PRODUCT_SETTINGS: ProductSettings = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}

interface ReadOptions {
  query?: QueryInit
  revalidate: number
  tags: string[]
}

async function read<T>(path: string, options: ReadOptions): Promise<T> {
  const { data } = await apiFetch<T>(path, options)
  return data
}

/**
 * null on the API's own 404 (an unknown or draft record); every other failure is thrown, a 404
 * page from a proxy in front of the API included.
 */
async function orNotFound<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    if (isApiNotFound(error)) return null
    throw error
  }
}

/**
 * A route slug as one API path segment: `path` is encoded once, `text` is decoded (for query
 * values and tags). null when it cannot be a single segment.
 */
function oneSegment(raw: string): { path: string; text: string } | null {
  const path = normalizeSlug(raw)
  if (path === null || path.includes('/')) return null
  return { path, text: decodeURIComponent(path) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One log line: the status and code of an API error, else the message. Never headers or URLs. */
function logFailure(loader: string, error: unknown): void {
  if (error instanceof ApiError) {
    console.error(`[catalog] ${loader} failed:`, error.status, error.code)
  } else {
    console.error(`[catalog] ${loader} failed:`, error instanceof Error ? error.message : error)
  }
}

/** Each field from the payload when it has the right type, else its default. */
function settingsFrom(raw: unknown): ProductSettings {
  const fallback = DEFAULT_PRODUCT_SETTINGS
  if (!isRecord(raw)) return { ...fallback }
  const count = (value: unknown, min: number, otherwise: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : otherwise
  const flag = (value: unknown, otherwise: boolean) =>
    typeof value === 'boolean' ? value : otherwise
  return {
    paginator_number: count(raw.paginator_number, 1, fallback.paginator_number),
    show_out_of_stock_label: flag(raw.show_out_of_stock_label, fallback.show_out_of_stock_label),
    related_items_display_status: flag(
      raw.related_items_display_status,
      fallback.related_items_display_status,
    ),
    related_items_number: count(raw.related_items_number, 0, fallback.related_items_number),
  }
}

/** `GET product/settings/`. Never throws: any failure logs once and gives the defaults. */
export const getProductSettings = cache(async (): Promise<ProductSettings> => {
  try {
    const data = await read<unknown>('product/settings', {
      revalidate: SETTINGS_REVALIDATE,
      tags: [CATALOG_TAG],
    })
    return settingsFrom(data)
  } catch (error) {
    logFailure('getProductSettings', error)
    return { ...DEFAULT_PRODUCT_SETTINGS }
  }
})

/** `GET homepage/`. Throws on failure, so the error boundary shows instead of an empty home. */
export const getHomePage = cache((): Promise<HomePage> =>
  read<HomePage>('homepage', { revalidate: HOME_REVALIDATE, tags: ['home', CATALOG_TAG] }),
)

/**
 * A detail loader: null for a slug that cannot be one segment, or on a 404; throws otherwise.
 * `<kind>/list/` is routed to the list endpoint, so for categories, brands and list pages a record
 * whose slug is `list` cannot be fetched (product digest §11.4): that slug is null too.
 */
function detailLoader<T>(endpoint: string, tag: string, revalidate: number, listReserved: boolean) {
  return cache(async (slug: string): Promise<T | null> => {
    const segment = oneSegment(slug)
    if (segment === null || (listReserved && segment.text === 'list')) return null
    return orNotFound(() =>
      read<T>(`${endpoint}/${segment.path}`, {
        revalidate,
        tags: [`${tag}:${segment.text}`, CATALOG_TAG],
      }),
    )
  })
}

/** `GET product/category/<slug>/`, by the category's own (last) slug. */
export const getCategory = detailLoader<CategoryDetail>(
  'product/category',
  'category',
  ENTITY_REVALIDATE,
  true,
)

/** `GET product/brand/<slug>/`. */
export const getBrand = detailLoader<BrandDetail>('product/brand', 'brand', ENTITY_REVALIDATE, true)

/** `GET product/list-page/<slug>/`. */
export const getListPage = detailLoader<ProductListPageDetail>(
  'product/list-page',
  'list',
  ENTITY_REVALIDATE,
  true,
)

/** `GET product/detail/<slug>/`, anonymous (no wishlist state, no staff preview). */
export const getProductDetail = detailLoader<ProductDetail>(
  'product/detail',
  'product',
  PRODUCT_REVALIDATE,
  false,
)

/**
 * Every published brand: `GET product/brand/list/`, following `next` 100 at a time. Throws when a
 * page fails. Past `MAX_BRAND_PAGES` it stops, warns once and returns what it read.
 */
export const getBrands = cache(async (): Promise<BrandCard[]> => {
  const brands: BrandCard[] = []
  for (let page = 1; page <= MAX_BRAND_PAGES; page++) {
    const data = await read<Paginated<BrandCard>>('product/brand/list', {
      query: { limit: BRAND_PAGE_SIZE, page },
      revalidate: ENTITY_REVALIDATE,
      tags: [CATALOG_TAG],
    })
    brands.push(...data.results)
    if (!data.next) return brands
  }
  console.warn(`[catalog] getBrands stopped after ${MAX_BRAND_PAGES} pages`)
  return brands
})

const listProducts = cache((search: string): Promise<Paginated<ProductCard>> =>
  read<Paginated<ProductCard>>('product/list', {
    query: Object.fromEntries(new URLSearchParams(search)),
    revalidate: LISTING_REVALIDATE,
    tags: [CATALOG_TAG],
  }),
)

/**
 * `GET product/list/` for a listing query (`parseListingParams` plus the route context). The query
 * goes through `toSearchParams`, so equal queries share one request and one cache entry.
 *
 * Throws `ApiError` on failure. A page past the last one is `ApiError { status: 404, code:
 * 'not_found' }` ("صفحه نامعتبر"): it propagates so the page can call `notFound()`. An unknown
 * category, brand or list slug is no error here (200 with `count: 0`); check it with its detail.
 */
export function getProductList(q: ListingApiQuery): Promise<Paginated<ProductCard>> {
  return listProducts(toSearchParams(q).toString())
}

/**
 * Whether `q` asks for a page past the last, which a listing answers with `notFound()`: for
 * `generateMetadata`, whose output Next would otherwise stream for the 404. Page 1 always exists
 * and costs nothing; a later page makes the listing's own list request (shared through the
 * cache). Other failures are thrown.
 */
export async function isPastLastPage(q: ListingApiQuery): Promise<boolean> {
  if ((q.page ?? 1) <= 1) return false
  try {
    await getProductList(q)
    return false
  } catch (error) {
    if (isApiNotFound(error)) return true
    throw error
  }
}

type FilterKind = 'category' | 'brand' | 'list'

/** The API's own priority when several contexts are sent. */
const FILTER_KINDS: readonly FilterKind[] = ['category', 'brand', 'list']

const filtersIn = cache(
  async (kind: FilterKind | null, raw: string): Promise<FiltersMetadata | null> => {
    const options: ReadOptions = { revalidate: LISTING_REVALIDATE, tags: [CATALOG_TAG] }
    if (kind !== null) {
      const segment = oneSegment(raw)
      if (segment === null) return null
      options.query = { [kind]: segment.text }
      options.tags = [`${kind}:${segment.text}`, CATALOG_TAG]
    }
    return orNotFound(() => read<FiltersMetadata>('product/filters', options))
  },
)

/**
 * `GET product/filters/` for one context; with none, the whole store. Only the first context in
 * the priority category > brand > list is sent, as the API would use. null on a 404 (an unknown
 * or draft slug, unlike `product/list/`) or for a malformed slug; throws otherwise.
 */
export function getFilters(ctx: ListingContext): Promise<FiltersMetadata | null> {
  const kind = FILTER_KINDS.find((candidate) => ctx[candidate] !== undefined) ?? null
  return filtersIn(kind, kind === null ? '' : (ctx[kind] ?? ''))
}
