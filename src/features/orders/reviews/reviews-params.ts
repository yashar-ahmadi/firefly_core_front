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
const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,199}$/u

type Search = Pick<URLSearchParams, 'get'>

export function parseReviewsParams(search: Search): ReviewsParams {
  const order = search.get('order') ?? ''
  const product = search.get('product') ?? ''
  return {
    page: parsePage(search.get('page')),
    target: ORDER.test(order) && SLUG.test(product) ? { order, product } : null,
  }
}

export function reviewsSearch({ page }: ReviewsParams): string {
  return toSearch(pageEntry(page))
}
