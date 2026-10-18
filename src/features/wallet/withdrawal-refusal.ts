import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { FeatureKey } from '@/lib/api/types/common'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

// What the withdrawal form does with each refusal of `POST wallet/withdrawal/request/` (order
// digest §3.3.4, §8.5). Field errors go under their fields by the API's `attr`; the rest are the
// form's (or the page's). Pure.

export type WithdrawalField = 'amount' | 'holder' | 'iban' | 'card'
export type WithdrawalErrors = Partial<Record<WithdrawalField | 'form', string>>

export type WithdrawalRefusal =
  | { kind: 'fields'; errors: WithdrawalErrors }
  /** `wallet_withdrawal_below_minimum`: the minimum is said on the amount. */
  | { kind: 'below_minimum'; message: string }
  /** 409 `wallet_insufficient_funds`: the balance is read again. */
  | { kind: 'insufficient'; message: string }
  /** `wallet_withdrawal_disabled`: the form goes. */
  | { kind: 'disabled'; message: string }
  /** 409 `wallet_withdrawal_pending_exists`: the open request is shown instead (+ cancel). */
  | { kind: 'pending_exists'; message: string }
  | { kind: 'frozen'; message: string }
  | { kind: 'feature_off'; feature: FeatureKey; reason: string }
  | { kind: 'throttled'; retryAfter: number }
  | { kind: 'session' }
  | { kind: 'other'; message: string }

/** The API's field names (`attr`) to the form's. */
const FIELDS: Record<string, WithdrawalField> = {
  amount: 'amount',
  account_holder_name: 'holder',
  iban: 'iban',
  card_number: 'card',
}

/** The refusals that are said with the API's own detail. */
type Said = Extract<WithdrawalRefusal, { message: string }>['kind']

const KINDS: Record<string, Exclude<Said, 'other'>> = {
  wallet_withdrawal_below_minimum: 'below_minimum',
  wallet_insufficient_funds: 'insufficient',
  wallet_withdrawal_disabled: 'disabled',
  wallet_withdrawal_pending_exists: 'pending_exists',
  wallet_frozen: 'frozen',
}

export function withdrawalRefusal(error: unknown): WithdrawalRefusal {
  if (isSessionExpiredError(error)) return { kind: 'session' }
  if (!(error instanceof ApiError)) return { kind: 'other', message: GENERIC_ERROR_DETAIL }
  if (error.status === 503 && error.isFeatureDisabled() && error.feature)
    return { kind: 'feature_off', feature: error.feature, reason: error.detail }
  const kind = KINDS[error.code]
  if (kind) return { kind, message: error.detail }
  if (error.status === 429) return { kind: 'throttled', retryAfter: error.retryAfter ?? 60 }
  if (error.status === 400) {
    const errors: WithdrawalErrors = {}
    for (const [attr, message] of Object.entries(error.fieldErrors())) {
      const field = FIELDS[attr]
      if (field) errors[field] ??= message
      else errors.form ??= message
    }
    if (Object.keys(errors).length > 0) return { kind: 'fields', errors }
  }
  return { kind: 'other', message: error.detail }
}
