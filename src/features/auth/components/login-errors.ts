import { authFailure, type FailureRules } from './auth-failure'
import type { LoginFailure, LoginField } from './login-types'

// What a failed login request means for the form (auth digest §6; see `authFailure`). Pure.

const LOGIN_RULES: FailureRules<LoginField> = {
  byCode: {
    auth_identifier_invalid: 'identifier',
    auth_invalid_credentials: 'password',
    auth_otp_invalid: 'otp',
    auth_otp_expired: 'otp',
    auth_totp_invalid: 'totp',
    auth_totp_locked: 'totp',
  },
  byAttr: {
    login_identifier: 'identifier',
    password: 'password',
    otp_code: 'otp',
    totp_code: 'totp',
  },
  /** Answers a TOTP code cannot change: the first step must be done again (or differently). */
  restart: new Set([
    'auth_otp_not_found',
    'auth_otp_too_many_attempts',
    'auth_user_not_found',
    'auth_not_verified',
    'auth_account_disabled',
    'auth_google_disabled',
    'auth_google_token_invalid',
    'auth_google_email_unverified',
    'feature_disabled',
  ]),
}

export function loginFailure(error: unknown): LoginFailure {
  return authFailure(error, LOGIN_RULES)
}
