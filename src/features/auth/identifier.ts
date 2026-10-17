import type { ContactType } from '@/lib/api/types/account'
import { normalizeIranMobile, toLatinDigits } from '@/lib/format'

// The login field takes an email address or a mobile number in one box («ایمیل یا شماره
// موبایل»); its type decides `login_method`. Pure: safe in any bundle.

/** Invisible marks a Persian keyboard or a paste can add (joiners, direction marks, BOM). */
const INVISIBLE = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}\u{061C}]/gu
/** One `@`, something before it, and a dot in the domain; no whitespace. Simple on purpose. */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u

function cleaned(value: string): string {
  return toLatinDigits(value).replace(INVISIBLE, '').trim()
}

/**
 * `'email'` for an email address, `'phone'` for an Iranian mobile number (any of `09…`, `+98…`,
 * `0098…`, `9…`, with Persian or Arabic digits, spaces or dashes), else null. Landlines are not
 * mobile numbers.
 */
export function identifierType(value: string): ContactType | null {
  const text = cleaned(value)
  if (EMAIL.test(text)) return 'email'
  return normalizeIranMobile(text) === null ? null : 'phone'
}

/**
 * The identifier as the API should get it: a mobile number as `09…` with Latin digits, an email
 * address (or anything else, for the API to judge) trimmed, with Latin digits and no invisible
 * marks.
 */
export function normalizeIdentifier(value: string): string {
  const text = cleaned(value)
  if (EMAIL.test(text)) return text
  return normalizeIranMobile(text) ?? text
}
