import { cleanPoints } from '@/features/product/components/reviews/comment-payload'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { PurchaseReviewRequest } from '@/lib/api/types/order-review'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

// A purchase review's values, what is checked before sending (the backend's own rules,
// `PurchaseReviewCreateSerializer`: the rating required 1–5, the text required and not blank, ≤
// 4096; the title ≤ 255; up to ten points of ≤ 255 each, without repeats), the request body, and
// where each of the API's answers goes (order digest §3.1.7, §8.2). Pure.

export const REVIEW_MAX = 4096
export const TITLE_MAX = 255

export interface ReviewValues {
  rating: number | null
  title: string
  review: string
  positive: string[]
  negative: string[]
  /** A point typed but not added yet: sent too. */
  positiveDraft: string
  negativeDraft: string
}

export const EMPTY_REVIEW: ReviewValues = {
  rating: null,
  title: '',
  review: '',
  positive: [],
  negative: [],
  positiveDraft: '',
  negativeDraft: '',
}

export type ReviewField = 'rating' | 'title' | 'review' | 'positive_points' | 'negative_points'
export type ReviewErrors = Partial<Record<ReviewField | 'form', string>>

const FIELDS: readonly ReviewField[] = [
  'rating',
  'title',
  'review',
  'positive_points',
  'negative_points',
]

export const RATING_MISSING = 'امتیاز این کالا را انتخاب کنید.'
export const REVIEW_MISSING = 'متن دیدگاه را بنویسید.'

/** What is wrong before anything is sent (empty: nothing). */
export function checkReview(values: ReviewValues): ReviewErrors {
  const errors: ReviewErrors = {}
  if (values.rating === null || values.rating < 1 || values.rating > 5)
    errors.rating = RATING_MISSING
  if (!values.review.trim()) errors.review = REVIEW_MISSING
  return errors
}

/** The body: every empty optional left out. */
export function reviewBody(productId: number, values: ReviewValues): PurchaseReviewRequest {
  const body: PurchaseReviewRequest = {
    product_id: productId,
    rating: values.rating ?? 0,
    review: values.review.trim(),
  }
  const title = values.title.trim()
  const positive = cleanPoints([...values.positive, values.positiveDraft])
  const negative = cleanPoints([...values.negative, values.negativeDraft])
  if (title) body.title = title
  if (positive.length > 0) body.positive_points = positive
  if (negative.length > 0) body.negative_points = negative
  return body
}

/** The purchase cannot be reviewed here any more: the list is read again, with why. */
const STALE: Record<string, string> = {
  order_review_product_not_in_order: 'این کالا در این سفارش نیست؛ فهرست به\u{200C}روز شد.',
  order_review_already_submitted:
    'دیدگاه این خرید پیش\u{200C}تر ثبت شده است؛ فهرست به\u{200C}روز شد.',
  order_review_not_eligible: 'ثبت دیدگاه برای این خرید اکنون ممکن نیست؛ فهرست به\u{200C}روز شد.',
  not_found: 'این سفارش پیدا نشد؛ فهرست به\u{200C}روز شد.',
}

export type ReviewRefusal =
  | { kind: 'fields'; errors: ReviewErrors }
  | { kind: 'stale'; message: string }
  /** 503 `product_comments`: the submit closes with the shop's reason. */
  | { kind: 'feature_off'; reason: string }
  | { kind: 'throttled'; retryAfter: number }
  | { kind: 'session' }
  | { kind: 'other'; message: string }

export function reviewRefusal(error: unknown): ReviewRefusal {
  if (isSessionExpiredError(error)) return { kind: 'session' }
  if (!(error instanceof ApiError)) return { kind: 'other', message: GENERIC_ERROR_DETAIL }
  const stale = STALE[error.code]
  if (stale && (error.status === 404 || error.status === 409))
    return { kind: 'stale', message: stale }
  if (error.isFeatureDisabled()) return { kind: 'feature_off', reason: error.detail }
  if (error.status === 429) return { kind: 'throttled', retryAfter: error.retryAfter ?? 60 }
  if (error.status === 400) {
    const errors: ReviewErrors = {}
    for (const [attr, message] of Object.entries(error.fieldErrors())) {
      const key = attr.split('.')[0] ?? attr
      const field = FIELDS.find((name) => name === key)
      if (field) errors[field] ??= message
      else errors.form ??= message
    }
    if (Object.keys(errors).length === 0) errors.form = error.detail
    return { kind: 'fields', errors }
  }
  return { kind: 'other', message: error.detail }
}
