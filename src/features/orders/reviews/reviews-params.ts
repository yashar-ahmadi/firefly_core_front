import { pageEntry, parsePage, toSearch } from '@/features/account/lists/page-param'

// «در انتظار دیدگاه»'s URL state: the page (`?page=2`), and the purchase the order's page sent
// the shopper to (`?order=<code>&product=<slug>`: its card takes the focus), read only: a page
// change leaves it out. Pure.

export interface ReviewsParams {
  page: number
  /** The purchase to bring forward, when the URL names one well-formed. */
  target: { order: string; product: string } | null
}

const ORDER = /^\d{10}$/

/**
 * Any slug a product page takes (`productPath`: one path segment, so Persian with its ZWNJ and
 * combining marks too): not empty, no `/`, not `.` or `..`, encodable (no lone surrogate).
 */
function isProductSlug(value: string): boolean {
  if (value === '' || value === '.' || value === '..' || value.length > 255) return false
  if (value.includes('/')) return false
  try {
    encodeURIComponent(value)
    return true
  } catch {
    return false
  }
}

type Search = Pick<URLSearchParams, 'get'>

export function parseReviewsParams(search: Search): ReviewsParams {
  const order = search.get('order') ?? ''
  const product = search.get('product') ?? ''
  return {
    page: parsePage(search.get('page')),
    target: ORDER.test(order) && isProductSlug(product) ? { order, product } : null,
  }
}

export function reviewsSearch({ page }: ReviewsParams): string {
  return toSearch(pageEntry(page))
}
