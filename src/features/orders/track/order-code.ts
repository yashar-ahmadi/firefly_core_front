import { toLatinDigits } from '@/lib/format/digits'

// An order's code as the shopper may type or read it (order digest §1.3: exactly 10 digits, may
// start with 0, a string): Persian and Arabic digits, spaces and dashes taken. Its own small module:
// the tracking links on the payment pages need it, and nothing else of the tracking form. Pure.

export const ORDER_CODE_LENGTH = 10

/** «۲۵۸۳ ۹۷۳-۸۷۷» → «2583973877» (a letter stays, and fails `isOrderCode`). */
export function normalizeOrderCode(value: string): string {
  return toLatinDigits(value).replace(/[\s\-\u{2010}-\u{2015}]/gu, '')
}

const ORDER_CODE = new RegExp(`^\\d{${ORDER_CODE_LENGTH}}$`)

/** Exactly 10 ASCII digits. */
export const isOrderCode = (value: string) => ORDER_CODE.test(value)
