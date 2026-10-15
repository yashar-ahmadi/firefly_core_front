/** Shared wire types of the Firefly REST API. Pure types and constants: safe in any bundle. */

/** Every response body is wrapped in this envelope; `code` mirrors the HTTP status. */
export interface Envelope<T> {
  msg: string
  code: number
  data: T
}

/** DRF page-number pagination. `next` and `previous` are full API URLs: never hand them to the browser. */
export interface Paginated<T> {
  count: number
  /** 1 (not 0) for an empty list. */
  total_pages: number
  current_page: number
  page_size: number
  next: string | null
  previous: string | null
  results: T[]
}

/** One entry of `data.errors` on a non-2xx response. `attr` is `null` for business errors. */
export interface ApiErrorItem {
  code: string
  detail: string
  attr: string | null
}

/** The ten features an operator can switch off at runtime. */
export const FEATURE_KEYS = [
  'blog',
  'blog_comments',
  'product_comments',
  'stock_notifications',
  'coupons',
  'pay_on_delivery',
  'online_payment',
  'wallet',
  'guest_checkout',
  'registration',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value)
}
