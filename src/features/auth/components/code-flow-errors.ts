import { authFailure, type FailureRules } from './auth-failure'
import type { CodeFlowFailure, CodeFlowField, CodeFlowStep } from './code-flow-types'

// What a failed registration or recovery request means for its form (auth digest §4.1–4.4,
// §4.12–4.14 and §6; see `authFailure`). Pure.

/** The token of the flow is void (unknown, used, or out of time): start over at step 1. */
const TOKEN_GONE = new Set(['auth_token_invalid', 'auth_token_expired'])

const REGISTER_RULES: FailureRules<CodeFlowField> = {
  byCode: {
    // An identifier taken (at the start, or in the meantime at complete): under its field,
    // with «ورود» for it.
    auth_email_already_exists: 'identifier',
    auth_phone_already_exists: 'identifier',
    auth_otp_invalid: 'otp',
    auth_otp_expired: 'otp',
    auth_password_weak: 'password',
  },
  byAttr: {
    first_name: 'firstName',
    last_name: 'lastName',
    // A missing identifier comes as `invalid` too, not `required` (§13 #7).
    email: 'identifier',
    phone_number: 'identifier',
    otp_code: 'otp',
    password: 'password',
    confirm_password: 'confirm',
  },
  restart: TOKEN_GONE,
}

/** Registration answers that belong to another step than the one on screen. */
const REGISTER_STEP_OF: Partial<Record<string, CodeFlowStep>> = {
  // A resend after the code was checked: on to the password.
  auth_already_verified: 'password',
  // Complete before the code was checked: back to it.
  auth_not_verified: 'code',
}

const RECOVERY_RULES: FailureRules<CodeFlowField> = {
  byCode: {
    auth_identifier_invalid: 'identifier',
    auth_otp_invalid: 'otp',
    auth_otp_expired: 'otp',
    // The reset token is not used up by these: another password is tried with it.
    auth_password_weak: 'password',
    auth_password_unchanged: 'password',
  },
  byAttr: {
    login_identifier: 'identifier',
    otp_code: 'otp',
    password: 'password',
    confirm_password: 'confirm',
  },
  restart: TOKEN_GONE,
}

export function registerFailure(error: unknown): CodeFlowFailure {
  const failure = authFailure(error, REGISTER_RULES)
  const step = REGISTER_STEP_OF[failure.code]
  return step ? { ...failure, step } : failure
}

/**
 * Password recovery. An unknown identifier is `404 auth_user_not_found` on the request: the API
 * says so on purpose (§4.12), so its detail is shown as it comes, nothing more.
 */
export function recoveryFailure(error: unknown): CodeFlowFailure {
  return authFailure(error, RECOVERY_RULES)
}
