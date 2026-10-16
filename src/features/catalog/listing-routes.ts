/**
 * Paths, redirects, indexing and titles of the listing routes: category, brand, curated list and
 * the generic `/product/list/` (product digest §2, §5.11, §6). Pure.
 */
import { parseListingParams, type ListingApiQuery } from '@/features/catalog/listing-params'
import { normalizeSlug } from '@/lib/url/slug'

type RawParams = Record<string, string | string[] | undefined>

/** Each `/`-separated segment encoded once: Persian slugs give an ASCII URL. */
function encodedPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/** `/product-category/<path>/` from the category's `path` («digital/mobile-phone»). */
export function categoryPath(path: string): string {
  return `/product-category/${encodedPath(path)}/`
}

export function brandPath(slug: string): string {
  return `/brand/${encodeURIComponent(slug)}/`
}

/** `/product/<slug>/`, the product page. */
export function productPath(slug: string): string {
  return `/product/${encodeURIComponent(slug)}/`
}

export function listPagePath(slug: string): string {
  return `/product/list/${encodeURIComponent(slug)}/`
}

/** The generic listing: the whole store, filtered by its query. */
export const LISTING_PATH = '/product/list/'
export const BRANDS_PATH = '/brand/'

/**
 * The requested category path in the API's (decoded) form, for comparing with a category's
 * `path`: Next may pass each segment still encoded or already decoded, and both read the same.
 * null when a segment cannot be a slug (malformed encoding, empty, `.`, `..`, an encoded `/`).
 */
export function requestedCategoryPath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null
  const decoded: string[] = []
  for (const segment of segments) {
    const normal = normalizeSlug(segment)
    if (normal === null || normal.includes('/')) return null
    decoded.push(decodeURIComponent(normal))
  }
  return decoded.join('/')
}

/** The page's query string, `?…` or "", repeated keys kept: carried over by a redirect. */
export function queryString(sp: RawParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) params.append(key, item)
    }
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

/** The part of `seoMetadata`'s input that a listing URL decides. */
export interface ListingIndexing {
  canonical?: string
  noindex: boolean
  noCanonical?: true
  page?: number
}

/**
 * Canonical, robots and page of a listing URL:
 * - any parameter other than `page` (filters, sort, tracking): `noindex, follow` and no canonical
 *   (a canonical to the clean page would contradict the noindex: a mixed signal);
 * - page N > 1 alone: indexable, canonical to itself with `?page=N`, «صفحهٔ N» in the title;
 * - page 1: indexable, canonical to the operator's `canonical_link`, else the path.
 */
export function listingIndexing(
  sp: RawParams,
  { path, canonicalLink = null }: { path: string; canonicalLink?: string | null },
): ListingIndexing {
  const clean = canonicalLink?.trim() || path
  const noindex = Object.entries(sp).some(([key, value]) => key !== 'page' && value !== undefined)
  if (noindex) return { noindex, noCanonical: true }
  const page = parseListingParams({ page: sp.page }).page ?? 1
  return page > 1
    ? { canonical: `${path}?page=${page}`, noindex, page }
    : { canonical: clean, noindex }
}

/** Whether the page's URL carries any query parameter (it is then another URL than its path). */
export function hasQuery(sp: RawParams): boolean {
  return Object.values(sp).some((value) => value !== undefined)
}

/**
 * The generic listing's title from its query (it has no SEO data of its own): the name of the
 * curated list the URL names when it exists; else what it filters, then how it is sorted.
 */
export function genericListingTitle(q: ListingApiQuery, listName?: string | null): string {
  if (q.list && listName) return listName
  if (q.has_discount) return 'تخفیف‌ها'
  if (q.is_special) return 'پیشنهادهای ویژه'
  if (q.sort === 'sale') return 'پرفروش‌ترین‌ها'
  if (q.sort === 'date-desc') return 'جدیدترین‌ها'
  return 'همهٔ محصولات'
}
