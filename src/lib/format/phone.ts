// Iranian mobile number parsing and display.
import { toLatinDigits, toPersianDigits } from './digits'

// Whitespace (incl. NBSP), hyphens/dashes, parentheses and invisible bidi/joiner marks.
// `\u{…}` escapes (with the u flag) keep the invisible characters visible in the source.
const SEPARATORS =
  /[\s\-\u{2010}-\u{2015}()\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}\u{061C}]/gu

// Optional country code (+98 / 0098 / 98, optionally followed by a stray trunk 0) or a bare
// trunk 0, then the 10-digit national number starting with 9.
const MOBILE = /^(?:(?:\+98|0098|98)0?|0)?(9\d{9})$/
// Same prefixes, then a 10-digit landline national number (area code without 0 + 8 digits).
const LANDLINE = /^(?:\+98|0098|98)?0?([1-8]\d{9})$/

function compact(value: string): string {
  return toLatinDigits(value).replace(SEPARATORS, '')
}

/**
 * Normalise an Iranian mobile number to `09xxxxxxxxx`. Accepts `09…`, `9…`, `+989…`, `00989…`
 * and `989…` written with Latin, Persian or Arabic-Indic digits and any spaces/dashes.
 * Returns null for anything that is not an Iranian mobile number (landlines included).
 */
export function normalizeIranMobile(value: string): string | null {
  const match = MOBILE.exec(compact(value))
  return match ? `0${match[1]}` : null
}

export function isIranMobile(value: string): boolean {
  return normalizeIranMobile(value) !== null
}

/**
 * Display an Iranian phone number in Persian digits: mobiles as «۰۹۱۲ ۱۲۳ ۴۵۶۷», landlines as
 * «۰۲۱ ۹۱۰۰ ۰۰۰۰». Anything else is returned with Persian digits and separators removed.
 */
export function formatIranMobile(value: string): string {
  const mobile = normalizeIranMobile(value)
  if (mobile) {
    return toPersianDigits(`${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`)
  }

  const cleaned = compact(value)
  const landline = LANDLINE.exec(cleaned)
  if (landline) {
    const national = landline[1]
    return toPersianDigits(`0${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`)
  }
  return toPersianDigits(cleaned)
}
