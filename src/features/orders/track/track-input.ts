import { normalizeIranMobile } from '@/lib/format/phone'
import type { OrderTrackingRequest } from '@/lib/api/types/order-detail'
import { isOrderCode, normalizeOrderCode } from './order-code'

// What the tracking form checks before anything is sent (order digest §3.1.8; the API's own
// rules: OrderTrackingRequestSerializer): the order code, exactly 10 digits (it may start with
// 0: a string; order-code.ts), and an Iranian mobile, the buyer's or the receiver's. Persian and Arabic digits,
// spaces and dashes are taken (a code read off an invoice, a number typed as «۰۹۱۲ ۳۴۵ ۶۷۸۹»);
// the API gets ASCII digits, the mobile as 09…. Messages are Persian, keyed by the API's field
// names, so its own answers land under the same fields. Pure.

export type TrackField = keyof OrderTrackingRequest

export type TrackErrors = Partial<Record<TrackField, string>>

export const TRACK_MESSAGES = {
  codeRequired: 'کد سفارش را وارد کنید',
  codeInvalid: 'کد سفارش باید ۱۰ رقم باشد',
  mobileRequired: 'شمارهٔ موبایل را وارد کنید',
  mobileInvalid: 'شمارهٔ موبایل معتبر نیست؛ مانند ۰۹۱۲۳۴۵۶۷۸۹',
} as const

export interface TrackInput {
  orderCode: string
  mobile: string
}

/** The body to send, or the fields' messages. */
export function checkTrack(
  input: TrackInput,
): { ok: true; body: OrderTrackingRequest } | { ok: false; errors: TrackErrors } {
  const errors: TrackErrors = {}
  const code = normalizeOrderCode(input.orderCode)
  if (!code) errors.order_code = TRACK_MESSAGES.codeRequired
  else if (!isOrderCode(code)) errors.order_code = TRACK_MESSAGES.codeInvalid
  const mobile = normalizeIranMobile(input.mobile)
  if (!input.mobile.trim()) errors.mobile_number = TRACK_MESSAGES.mobileRequired
  else if (!mobile) errors.mobile_number = TRACK_MESSAGES.mobileInvalid
  if (Object.keys(errors).length > 0 || !mobile) return { ok: false, errors }
  return { ok: true, body: { order_code: code, mobile_number: mobile } }
}
