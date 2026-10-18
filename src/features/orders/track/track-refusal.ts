import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { TrackErrors, TrackField } from './track-input'

// What a refused tracking lookup does on the page (order digest §3.1.8, §8.2; live bodies in
// tests/fixtures/order-track.json). Pure.
// - 400 validation: each message under the field its `attr` names (`order_code`, `mobile_number`).
// - 404 `order_tracking_not_found` (an unknown code and a wrong number alike): said plainly, the
//   values kept to correct.
// - 429 (`order_tracking`, 20/min per IP): its `retry_after` before the next press.
// - No answer, or anything else: its sentence, and the next press tries again.

export const NOT_FOUND = 'سفارشی با این شماره و کد پیدا نشد'
export const NOT_FOUND_HINT =
  'کد ۱۰ رقمی سفارش و شمارهٔ موبایل خریدار یا گیرندهٔ آن را دوباره بررسی کنید.'
export const THROTTLED =
  'تعداد تلاش\u{200C}ها بیش از حد مجاز است؛ پس از پایان زمان زیر دوباره تلاش کنید.'

export type TrackRefusal =
  | { kind: 'fields'; errors: TrackErrors }
  | { kind: 'not_found' }
  | { kind: 'throttled'; retryAfter: number }
  | { kind: 'other'; message: string }

const FIELDS: ReadonlySet<string> = new Set<TrackField>(['order_code', 'mobile_number'])

export function trackRefusal(error: unknown): TrackRefusal {
  if (!(error instanceof ApiError)) return { kind: 'other', message: GENERIC_ERROR_DETAIL }
  if (error.status === 429) return { kind: 'throttled', retryAfter: error.retryAfter ?? 60 }
  if (error.code === 'order_tracking_not_found') return { kind: 'not_found' }
  const errors: TrackErrors = {}
  for (const item of error.errors) {
    const field = item.attr as TrackField | null
    if (field && FIELDS.has(field) && !errors[field]) errors[field] = item.detail || error.detail
  }
  if (Object.keys(errors).length > 0) return { kind: 'fields', errors }
  return { kind: 'other', message: error.detail }
}
