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
  orNotFound,
  read,
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
