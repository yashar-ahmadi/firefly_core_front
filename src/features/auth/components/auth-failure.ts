import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import { toPersianDigits } from '@/lib/format'

// What a failed auth request means for a form (auth digest §6), for every auth page: the API's
// `detail` is the text, its `code` decides where it goes; each page names its own fields. Pure.

/** What a failed request means for the form. */
export interface AuthFailure<F extends string> {
  /** Shown under this field, on its step; without one, a notice on the step. */
  field?: F
  detail: string
  code: string
  /** A 429's `retry_after`: the wait before the step's main action, or before the next send. */
  retryAfter?: number | null
  /** The wait is for a new code (a send was refused, or the code is spent), not the step. */
  sendSide?: boolean
  /** The code sent is void (or there is none): a new one must be asked for. */
  forgetCode?: boolean
  /** The first step cannot succeed as it was: it must be done again (or differently). */
  restart?: boolean
  /** `auth_password_weak`: every reason the password was refused for (`data.reasons`). */
  reasons?: string[]
}

/** Where a page shows the codes it knows. */
export interface FailureRules<F extends string> {
  /** Codes that belong under one field (`auth_identifier_invalid` comes with `attr: null`). */
  byCode: Partial<Record<string, F>>
  /** Validation errors (`attr` set) of the page's request bodies. */
  byAttr: Partial<Record<string, F>>
  /** Codes after which the first step must be done again. */
  restart: ReadonlySet<string>
}

/**
 * There is no code to type any more: none was found, five wrong tries voided it, or a send
 * failed (which voids the previous code, `auth_otp_send_failed`).
 */
const CODE_GONE = new Set([
  'auth_otp_not_found',
  'auth_otp_too_many_attempts',
  'auth_otp_send_failed',
])

/** 429s whose wait is for a new code, whichever request answered them. */
const SEND_SIDE = new Set([
  'auth_otp_throttled',
  'auth_otp_daily_limit',
  'auth_otp_too_many_attempts',
])

function reasonsOf(error: ApiError): string[] | undefined {
  const { reasons } = error.data
  if (!Array.isArray(reasons)) return undefined
  const texts = reasons.filter(
    (reason): reason is string => typeof reason === 'string' && reason !== '',
  )
  return texts.length > 0 ? texts : undefined
}

export function authFailure<F extends string>(
  error: unknown,
  rules: FailureRules<F>,
): AuthFailure<F> {
  if (!(error instanceof ApiError)) return { detail: GENERIC_ERROR_DETAIL, code: 'unknown' }
  const attr = error.errors[0]?.attr
  const field = rules.byCode[error.code] ?? (attr ? rules.byAttr[attr] : undefined)
  const reasons = reasonsOf(error)
  return {
    ...(field ? { field } : {}),
    // The generic throttle sentence is DRF's, with Latin digits.
    detail: error.code === 'throttled' ? toPersianDigits(error.detail) : error.detail,
    code: error.code,
    retryAfter: error.retryAfter,
    forgetCode: CODE_GONE.has(error.code),
    sendSide: SEND_SIDE.has(error.code),
    restart: rules.restart.has(error.code),
    ...(reasons ? { reasons } : {}),
  }
}
