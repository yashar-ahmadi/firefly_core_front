import 'server-only'
import { cache } from 'react'
import {
  toSearchParams,
  type ListingApiQuery,
  type ListingContext,
} from '@/features/catalog/listing-params'
import {
  CATALOG_TAG,
  ENTITY_REVALIDATE,
  oneSegment,
  orRememberedNotFound,
  read,
  visitorIp,
  type ReadOptions,
} from '@/features/catalog/loaders/read'
import { isApiNotFound } from '@/lib/api/errors'
import type { BrandCard, FiltersMetadata, ProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'

// The catalog's list loaders: brands, product lists and filter metadata (export them from
// ../api.ts).

const LISTING_REVALIDATE = 60

const BRAND_PAGE_SIZE = 100
/** A bound on a misbehaving `next` link: 2000 brands. */
const MAX_BRAND_PAGES = 20

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

const listProducts = cache(
  (search: string, forwardedFor: string | null): Promise<Paginated<ProductCard>> =>
    read<Paginated<ProductCard>>('product/list', {
      query: Object.fromEntries(new URLSearchParams(search)),
      revalidate: LISTING_REVALIDATE,
      tags: [CATALOG_TAG],
      forwardedFor,
    }),
)

/**
 * Whether the visitor chose the query freely enough that it is unlikely to be shared: a search
 * term, a price bound, attribute values or more than one brand. Plain listings (no parameters,
 * or only sort, page, the boolean toggles or a single brand) are a bounded set and stay shared.
 */
export function isLongTail(q: ListingApiQuery): boolean {
  return (
    Boolean(q.search) ||
    q.min_price !== undefined ||
    q.max_price !== undefined ||
    (q.attribute_values?.length ?? 0) > 0 ||
    (q.brand?.length ?? 0) > 1
  )
}

/**
 * `GET product/list/` for a listing query (`parseListingParams` plus the route context). The query
 * goes through `toSearchParams`, so equal queries share one request and one cache entry.
 *
 * A long-tail query (`isLongTail`) also sends the visitor IP: its cache entry is then per visitor
 * and a miss is charged to the visitor's own API rate limit, so made-up queries cannot spend the
 * storefront's anonymous budget. Every other listing is shared by all visitors.
 *
 * Throws `ApiError` on failure. A page past the last one is `ApiError { status: 404, code:
 * 'not_found' }` ("صفحه نامعتبر"): it propagates so the page can call `notFound()`. An unknown
 * category, brand or list slug is no error here (200 with `count: 0`); check it with its detail.
 */
export async function getProductList(q: ListingApiQuery): Promise<Paginated<ProductCard>> {
  const forwardedFor = isLongTail(q) ? await visitorIp() : null
  return listProducts(toSearchParams(q).toString(), forwardedFor)
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
    let key = 'product/filters'
    if (kind !== null) {
      const segment = oneSegment(raw)
      if (segment === null) return null
      options.query = { [kind]: segment.text }
      options.tags = [`${kind}:${segment.text}`, CATALOG_TAG]
      key = `product/filters?${kind}=${segment.path}`
    }
    return orRememberedNotFound(key, () => read<FiltersMetadata>('product/filters', options))
  },
)

/**
 * `GET product/filters/` for one context; with none, the whole store. Only the first context in
 * the priority category > brand > list is sent, as the API would use. null on a 404 (an unknown
 * or draft slug, unlike `product/list/`; remembered for a minute like a detail 404) or for a
 * malformed slug; throws otherwise.
 */
export function getFilters(ctx: ListingContext): Promise<FiltersMetadata | null> {
  const kind = FILTER_KINDS.find((candidate) => ctx[candidate] !== undefined) ?? null
  return filtersIn(kind, kind === null ? '' : (ctx[kind] ?? ''))
}
