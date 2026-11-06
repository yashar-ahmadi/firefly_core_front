import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import type { PaymentCancelResult, PaymentStatus } from '@/lib/api/types/payment'

// An open attempt's own call through the BFF (order digest §3.2.6): abandon it
// (`POST payment/<uuid>/cancel/`, the 30/h `payment_attempt` budget shared with the intents).
// Its status is read by `usePaymentStatus` (status-api.ts). The uuid is a bearer credential: in
// the path only, never in a log.

/**
 * A 429's sentence: the account lists' own words, kept here rather than imported from their
 * client module (`list-error.tsx`). That import, in this lazily loaded chunk under the placed
 * order's, made Turbopack regroup the providers' shared chunks: +0.4 KB on every page (measured).
 */
const THROTTLED_MESSAGE = 'لطفاً کمی بعد دوباره تلاش کنید.'

/**
 * The shop's sentence for a parked capture, when the envelope brings none of its own: the API's
 * `PARKED_CAPTURE_ABANDONED_MESSAGE`, as it reads today.
 */
export const PARKED_CAPTURE =
  'این تلاش بسته شد. مبلغی که بانک برای آن برداشته روی سفارش ثبت نشده و فروشگاه آن را پیگیری می\u{200C}کند.'

export type CancelOutcome =
  | {
      ok: true
      /** The payment as it is now: `cancelled`, or what it had become (`settled`, say). */
      status: PaymentStatus
      /**
       * The shop's sentence when the bank had taken money the order could not book (a parked
       * capture: `capture_parked`, the envelope's own `msg` saying it, digest §3.2.6): show it,
       * never «pay again».
       */
      parked: string | null
    }
  | {
      ok: false
      /**
       * - `under_review`: a receipt is in the queue (`payment_under_review`): it cannot be abandoned;
       * - `stale`: not an open order attempt (`payment_target_invalid`, `payment_not_found`);
       * - `throttled`, `other` (a lost answer included: the press can be repeated). Whoever holds
       *   the uuid may abandon the attempt (BACKEND-ISSUES M-7, fixed): no refusal for another
       *   account's payment any more.
       */
      problem: 'under_review' | 'stale' | 'throttled' | 'other'
      detail: string
    }

const PROBLEMS: Record<string, Exclude<CancelOutcome, { ok: true }>['problem']> = {
  payment_under_review: 'under_review',
  payment_target_invalid: 'stale',
  payment_not_found: 'stale',
}

/** Abandons the attempt; never throws. */
export async function cancelAttempt(uuid: string): Promise<CancelOutcome> {
  try {
    const { data, msg } = await bffFetch<PaymentCancelResult>(`payment/${uuid}/cancel/`, {
      method: 'POST',
    })
    // The flag decides (BACKEND-ISSUES J-34, fixed), never the sentence: the panel may reword it.
    const parked = data.capture_parked === true ? msg.trim() || PARKED_CAPTURE : null
    return { ok: true, status: data.status, parked }
  } catch (error) {
    if (!(error instanceof ApiError))
      return { ok: false, problem: 'other', detail: GENERIC_ERROR_DETAIL }
    if (error.status === 429) return { ok: false, problem: 'throttled', detail: THROTTLED_MESSAGE }
    const problem = PROBLEMS[error.code] ?? 'other'
    const detail = error.status === 0 ? NETWORK_ERROR_DETAIL : error.detail
    return { ok: false, problem, detail }
  }
}
