import { toLatinDigits, toPersianDigits } from '@/lib/format/digits'
import { regroupField } from './digit-field'

// A money field as the shopper types it (Plan 4 Task 9): digits in any script (Persian, Arabic,
// Latin), separators, spaces and anything else ignored; shown grouped in Persian digits as typed
// («۱۰۰٬۰۰۰»), the caret kept after the same digit. Whole Toman only. Pure.

/** Twelve digits at most: well past any amount the API takes (a field that cannot run away). */
export const AMOUNT_DIGITS_MAX = 12

const GROUP = '\u{066C}'

/** The digits of `text` (Latin), leading zeros dropped: '' when there is none. */
export function amountDigits(text: string): string {
  return toLatinDigits(text)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, AMOUNT_DIGITS_MAX)
}

/** The amount typed, or null when no digit was typed. */
export function parseAmount(text: string): number | null {
  const digits = amountDigits(text)
  return digits === '' ? null : Number(digits)
}

/** Latin digits grouped by thousands with the Persian separator, in Persian digits. */
export function groupDigits(digits: string): string {
  return toPersianDigits(digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP))
}

/** What the field shows for `amount` (null: empty). */
export const amountText = (amount: number | null): string =>
  amount === null ? '' : groupDigits(String(amount))

/** The field after a keystroke or a paste: grouped again, the caret after the same digit. */
export const regroup = (value: string, caret: number) =>
  regroupField(value, caret, { digits: amountDigits, show: groupDigits })
