import type { AwaitingReviewOrder, AwaitingReviewProduct } from '@/lib/api/types/order-review'
import type { AwaitingPage } from './reviews-api'

// «در انتظار دیدگاه»'s purchases: one (order, product) pair per card. Pure.

export type Pair = { order: AwaitingReviewOrder; product: AwaitingReviewProduct }

export const pairsOf = (page: AwaitingPage | undefined): Pair[] =>
  (page?.results ?? []).flatMap((order) => order.products.map((product) => ({ order, product })))

/** The same purchase, by its order's code and its product (the list may have been read again). */
export const samePair = (a: Pair, b: Pair): boolean =>
  a.order.order_code === b.order.order_code && a.product.id === b.product.id

/** The purchase the focus moves to once `pair` leaves the list: the next, else the one before. */
export function pairAfter(pairs: Pair[], pair: Pair): Pair | undefined {
  const index = pairs.findIndex((item) => samePair(item, pair))
  if (index === -1) return undefined
  return pairs[index + 1] ?? pairs[index - 1]
}

/** The page without one purchase (and without its order once nothing of it is left). */
export function without(page: AwaitingPage, { order, product }: Pair): AwaitingPage {
  const results = page.results
    .map((entry) =>
      entry.order_code === order.order_code
        ? { ...entry, products: entry.products.filter((item) => item.id !== product.id) }
        : entry,
    )
    .filter((entry) => entry.products.length > 0)
  return { ...page, count: Math.max(0, page.count - 1), results }
}

/** The order page's purchase is not on the page shown (another page, or reviewed already). */
export const targetMissingText = (morePages: boolean): string =>
  morePages
    ? 'کالایی که از صفحهٔ سفارش انتخاب کردید در این صفحه نیست؛ آن را در صفحه\u{200C}های دیگر این فهرست پیدا کنید، یا دیدگاه آن پیش\u{200C}تر ثبت شده است.'
    : 'کالایی که از صفحهٔ سفارش انتخاب کردید در این صفحه نیست؛ دیدگاه آن پیش\u{200C}تر ثبت شده یا دیگر در انتظار دیدگاه نیست.'
