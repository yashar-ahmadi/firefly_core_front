import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import { toPersianDigits } from '@/lib/format'
import type { LoginFailure, LoginField } from './login-types'

// What a failed login request means for the form (auth digest §6): the API's `detail` is the
// text, its `code` decides where it goes. Pure.

/** Codes that belong under one field. `auth_identifier_invalid` comes with `attr: null`. */
const FIELD_OF_CODE: Partial<Record<string, LoginField>> = {
  auth_identifier_invalid: 'identifier',
  auth_invalid_credentials: 'password',
  auth_otp_invalid: 'otp',
  auth_otp_expired: 'otp',
  auth_totp_invalid: 'totp',
  auth_totp_locked: 'totp',
}

/** Validation errors (`attr` set) of the login bodies. */
const FIELD_OF_ATTR: Partial<Record<string, LoginField>> = {
  login_identifier: 'identifier',
  password: 'password',
  otp_code: 'otp',
  totp_code: 'totp',
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

/** Answers a TOTP code cannot change: the first step must be done again (or differently). */
const RESTART = new Set([
  'auth_otp_not_found',
  'auth_otp_too_many_attempts',
  'auth_user_not_found',
  'auth_not_verified',
  'auth_account_disabled',
  'auth_google_disabled',
  'auth_google_token_invalid',
  'auth_google_email_unverified',
  'feature_disabled',
])

export function loginFailure(error: unknown): LoginFailure {
  if (!(error instanceof ApiError)) return { detail: GENERIC_ERROR_DETAIL, code: 'unknown' }
  const attr = error.errors[0]?.attr
  const field = FIELD_OF_CODE[error.code] ?? (attr ? FIELD_OF_ATTR[attr] : undefined)
  return {
    ...(field ? { field } : {}),
    // The generic throttle sentence is DRF's, with Latin digits.
    detail: error.code === 'throttled' ? toPersianDigits(error.detail) : error.detail,
    code: error.code,
    retryAfter: error.retryAfter,
    forgetCode: CODE_GONE.has(error.code),
    sendSide: SEND_SIDE.has(error.code),
    restart: RESTART.has(error.code),
  }
}
