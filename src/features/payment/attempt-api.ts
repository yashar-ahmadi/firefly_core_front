import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import type { PaymentStatus, PaymentStatusInfo } from '@/lib/api/types/payment'

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

/** The envelope's sentence for an ordinary 200 (the API's `STATUS_MESSAGES[200]`). */
const ORDINARY_OK = 'درخواست با موفقیت انجام شد.'

export type CancelOutcome =
  | {
      ok: true
      /** The payment as it is now: `cancelled`, or what it had become (`settled`, say). */
      status: PaymentStatus
      /**
       * The shop's sentence when the bank had taken money the order could not book (a parked
       * capture: the envelope's own `msg`, digest §3.2.6): show it, never «pay again».
       */
      parked: string | null
    }
  | {
      ok: false
      /**
       * - `under_review`: a receipt is in the queue (`payment_under_review`): it cannot be abandoned;
       * - `stale`: not an open order attempt (`payment_target_invalid`, `payment_not_found`);
       * - `forbidden`: another account's payment (`payment_forbidden`);
       * - `throttled`, `other` (a lost answer included: the press can be repeated).
       */
      problem: 'under_review' | 'stale' | 'forbidden' | 'throttled' | 'other'
      detail: string
    }

const PROBLEMS: Record<string, Exclude<CancelOutcome, { ok: true }>['problem']> = {
  payment_under_review: 'under_review',
  payment_target_invalid: 'stale',
  payment_not_found: 'stale',
  payment_forbidden: 'forbidden',
}

/** Abandons the attempt; never throws. */
export async function cancelAttempt(uuid: string): Promise<CancelOutcome> {
  try {
    const { data, msg } = await bffFetch<PaymentStatusInfo>(`payment/${uuid}/cancel/`, {
      method: 'POST',
    })
    const parked = msg.trim() && msg.trim() !== ORDINARY_OK ? msg.trim() : null
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
