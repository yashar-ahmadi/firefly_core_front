import { UnsafeHandoffError } from '@/features/payment/handoff-url'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { FeatureKey } from '@/lib/api/types/common'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

// What the top-up box does with each refusal of `POST wallet/top-up/` (order digest §3.3.3,
// §8.3, §8.5), checked in the API's own order. Pure.

export type TopUpRefusal =
  /** `wallet_top_up_disabled`: the box goes (the shop stopped top-ups). */
  | { kind: 'disabled'; message: string }
  /** Under the floor, over the ceiling or the day's rest (`min_value` too): the bound is said. */
  | { kind: 'amount'; message: string }
  /** 403 `wallet_frozen`: its detail is the freeze message. */
  | { kind: 'frozen'; message: string }
  /** `gateway_unknown`: that gateway is left out for the page. */
  | { kind: 'gateway_unknown'; message: string }
  /** `gateway_amount_not_supported`: that gateway is left out at that amount (its bound said). */
  | { kind: 'gateway_amount'; message: string }
  /** `gateway_not_configured` / `gateway_result_url_invalid`: no bank here; support. */
  | { kind: 'gateway_broken'; message: string }
  /**
   * 503 `gateway_unavailable`: the bank did not answer; later, with a new key. Also a handoff
   * that leads to no bank's page (`UnsafeHandoffError`): nothing to go to.
   */
  | { kind: 'gateway_unavailable'; message: string }
  /** 502 `gateway_rejected`: the bank said no; another gateway, no automatic retry. */
  | { kind: 'gateway_rejected'; message: string }
  /** `payment_idempotency_conflict`: the key's attempt is over; the next press is new. */
  | { kind: 'conflict'; message: string }
  /** 410 `gateway_token_expired`: a new key, a new attempt. */
  | { kind: 'token_expired'; message: string }
  /** Still `payment_attempt_starting` after the same-key retries. */
  | { kind: 'starting'; message: string }
  | { kind: 'feature_off'; feature: FeatureKey; reason: string }
  | { kind: 'throttled'; retryAfter: number }
  | { kind: 'session' }
  | { kind: 'other'; message: string }

/** The refusals that are said with the API's own detail. */
type Said = Extract<TopUpRefusal, { message: string }>['kind']

const KINDS: Record<string, Said> = {
  wallet_top_up_disabled: 'disabled',
  wallet_top_up_below_minimum: 'amount',
  wallet_top_up_above_maximum: 'amount',
  wallet_top_up_daily_limit_exceeded: 'amount',
  min_value: 'amount',
  wallet_frozen: 'frozen',
  gateway_unknown: 'gateway_unknown',
  gateway_amount_not_supported: 'gateway_amount',
  gateway_not_configured: 'gateway_broken',
  gateway_result_url_invalid: 'gateway_broken',
  gateway_unavailable: 'gateway_unavailable',
  gateway_rejected: 'gateway_rejected',
  payment_idempotency_conflict: 'conflict',
  gateway_token_expired: 'token_expired',
  payment_attempt_starting: 'starting',
}

export function topUpRefusal(error: unknown): TopUpRefusal {
  if (isSessionExpiredError(error)) return { kind: 'session' }
  if (error instanceof UnsafeHandoffError)
    return { kind: 'gateway_unavailable', message: GENERIC_ERROR_DETAIL }
  if (!(error instanceof ApiError)) return { kind: 'other', message: GENERIC_ERROR_DETAIL }
  if (error.status === 503 && error.isFeatureDisabled() && error.feature)
    return { kind: 'feature_off', feature: error.feature, reason: error.detail }
  const kind = KINDS[error.code]
  if (kind) return { kind, message: error.detail }
  if (error.status === 429) return { kind: 'throttled', retryAfter: error.retryAfter ?? 60 }
  return { kind: 'other', message: error.detail }
}
