import { CODE_INCOMPLETE } from '@/features/auth/components/auth-messages'
import type { CodeFlowField } from '@/features/auth/components/code-flow-types'
import { identifierType, normalizeIdentifier } from '@/features/auth/identifier'
import type { ContactType, OtpMethod, UserProfile } from '@/lib/api/types/account'
import { normalizeIranMobile } from '@/lib/format'

// Adding or changing the email or the phone (auth digest §4.17–4.18, F9): what the change must
// prove, and the checks before its request. Pure.

/** The first step of a contact change. */
export interface ContactEntry {
  /** The new email address or mobile number, as typed. */
  value: string
  /** The account's current password, when the change needs it. */
  password: string
  /** The authenticator's code, when the change needs it too. */
  totpCode: string
  /** A request carried an authenticator code: it is spent, the next one is asked for. */
  totpUsed: boolean
  /** The visitor's choice of channel (a phone with SMS and Telegram on); null: the default. */
  channel: OtpMethod | null
}

export const CONTACT_LABEL: Record<ContactType, string> = {
  email: 'ایمیل',
  phone: 'شماره موبایل',
}

/** The identifier of that type, and whether it is verified. */
export function currentContact(me: UserProfile, type: ContactType) {
  const value = type === 'email' ? me.email : me.phone_number
  const verified =
    value !== null && (type === 'email' ? me.is_email_verified : me.is_phone_verified)
  return { value, verified }
}

/**
 * The account's identifier as the login form takes it (its email, else its mobile as `09…`), for
 * a password manager to save with the password typed next to it.
 */
export function usernameOf(me: UserProfile): string {
  if (me.email) return me.email
  return me.phone_number ? (normalizeIranMobile(me.phone_number) ?? me.phone_number) : ''
}

/** What a contact change must send besides the new value. */
export interface ContactProof {
  password: boolean
  totp: boolean
}

/**
 * §4.17: the current password iff the identifier of that type is verified and the account has a
 * password (one made through Google has none: the code to the new address is the only proof);
 * the authenticator's code too iff the password is asked and two-step login is on.
 */
export function contactProof(me: UserProfile, type: ContactType, totpOn: boolean): ContactProof {
  const password = currentContact(me, type).verified && me.has_usable_password
  return { password, totp: password && totpOn }
}

/** The new value as the API takes it (a mobile number as `09…`), or null when it is not one. */
export function normalizeContact(type: ContactType, value: string): string | null {
  if (type === 'phone') return normalizeIranMobile(value)
  return identifierType(value) === 'email' ? normalizeIdentifier(value) : null
}

const VALUE_MESSAGES: Record<ContactType, { required: string; invalid: string }> = {
  email: {
    required: 'ایمیل را وارد کنید.',
    invalid: 'ایمیل را درست وارد کنید؛ مثلاً name@example.com.',
  },
  phone: {
    required: 'شماره موبایل را وارد کنید.',
    invalid: 'شماره موبایل را درست وارد کنید؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.',
  },
}

/** The checks of the first step, every field at once. */
export function contactErrors(
  type: ContactType,
  entry: ContactEntry,
  proof: ContactProof,
): Partial<Record<CodeFlowField, string>> {
  const errors: Partial<Record<CodeFlowField, string>> = {}
  if (entry.value.trim() === '') errors.identifier = VALUE_MESSAGES[type].required
  else if (normalizeContact(type, entry.value) === null) {
    errors.identifier = VALUE_MESSAGES[type].invalid
  }
  if (proof.password && entry.password === '') errors.currentPassword = 'رمز فعلی را وارد کنید.'
  if (proof.totp && entry.totpCode.length !== 6) errors.totp = CODE_INCOMPLETE
  return errors
}
