import { authFailure, type FailureRules } from './auth-failure'
import type { CodeFlowFailure, CodeFlowField, CodeFlowStep } from './code-flow-types'

// What a failed registration, recovery or contact-change request means for its form (auth
// digest §4.1–4.4, §4.12–4.14, §4.17–4.18 and §6; see `authFailure`). Pure.

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
  // The identifier is taken: the token started for it is dead, a new start must make another.
  restart: new Set([...TOKEN_GONE, 'auth_email_already_exists', 'auth_phone_already_exists']),
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

const CONTACT_RULES: FailureRules<CodeFlowField> = {
  byCode: {
    // Taken by another account (at the request, or in the meantime at the verify), or the very
    // address the account has verified already: under the new identifier.
    auth_email_already_exists: 'identifier',
    auth_phone_already_exists: 'identifier',
    auth_contact_unchanged: 'identifier',
    // The proof (§4.17); a required one the form did not ask for shows its field from then on.
    auth_password_required: 'currentPassword',
    auth_password_invalid: 'currentPassword',
    auth_totp_required: 'totp',
    auth_totp_invalid: 'totp',
    auth_totp_locked: 'totp',
    auth_otp_invalid: 'otp',
    auth_otp_expired: 'otp',
  },
  byAttr: {
    email: 'identifier',
    phone_number: 'identifier',
    otp_method: 'identifier',
    password: 'currentPassword',
    totp_code: 'totp',
    otp_code: 'otp',
  },
  // Taken in the meantime (at the verify): the code sent is for an address that cannot be had.
  restart: new Set(['auth_email_already_exists', 'auth_phone_already_exists']),
}

/**
 * Adding or changing the email or the phone from the profile (F9). `auth_otp_not_found` (no
 * code for this change, or for the other type) voids the code: a new one is asked for.
 */
export function contactFailure(error: unknown): CodeFlowFailure {
  return authFailure(error, CONTACT_RULES)
}
