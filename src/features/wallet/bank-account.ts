import { toLatinDigits, toPersianDigits } from '@/lib/format/digits'

// The withdrawal's bank account (order digest §2 `WithdrawalInput`, §7): the sheba (IBAN) is
// «IR» and 24 digits, paste-friendly here as the backend is (spaces, dashes, a leading «IR» in
// any case, Persian and Arabic digits), checked by its ISO 13616 mod-97 checksum before it is
// sent (the backend checks again: `iban_invalid`); the card number is optional, 16 digits with
// a valid Luhn check digit, a cross-check only (`card_number_invalid`). Pure.

export const SHEBA_DIGITS = 24
export const CARD_DIGITS = 16

const onlyDigits = (text: string) => toLatinDigits(text).replace(/\D/g, '')

/** The sheba's 24 digits as typed or pasted (its «IR» and separators dropped). */
export function shebaDigits(text: string): string {
  return onlyDigits(text.trim().replace(/^\s*i\s*r/i, '')).slice(0, SHEBA_DIGITS)
}

/** ISO 13616: the country and check digits moved to the end, letters as numbers, mod 97 = 1. */
export function isShebaValid(iban: string): boolean {
  if (!/^IR\d{24}$/.test(iban)) return false
  const moved = `${iban.slice(4)}1827${iban.slice(2, 4)}` // I = 18, R = 27
  let rest = 0
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97
  return rest === 1
}

const count = (digits: string) => toPersianDigits(digits.length)

/** What is wrong with the sheba's digits, or null. */
export function shebaProblem(digits: string): string | null {
  if (digits === '') return 'شماره شبا را وارد کنید.'
  if (digits.length !== SHEBA_DIGITS)
    return `شماره شبا پس از IR باید ۲۴ رقم باشد (اکنون ${count(digits)} رقم).`
  if (!isShebaValid(`IR${digits}`)) return 'شماره شبا درست نیست؛ آن را دوباره بررسی کنید.'
  return null
}

const groupsOfFour = (digits: string) => toPersianDigits(digits.replace(/(\d{4})(?=\d)/g, '$1 '))

/** «۰۶۲۹ ۶۰۰۰ …»: the sheba's digits in groups of four. */
export const groupSheba = groupsOfFour

/** A whole sheba shown («IR۰۶ ۲۹۶۰ …»), left to right. */
export const shownSheba = (iban: string) =>
  /^IR\d{24}$/i.test(iban)
    ? `IR${groupsOfFour(iban.slice(2, 4))} ${groupsOfFour(iban.slice(4))}`
    : iban

/** The card number's 16 digits as typed or pasted. */
export const cardDigits = (text: string): string => onlyDigits(text).slice(0, CARD_DIGITS)

export const groupCard = groupsOfFour

export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** What is wrong with the card number's digits (none given is fine), or null. */
export function cardProblem(digits: string): string | null {
  if (digits === '') return null
  if (digits.length !== CARD_DIGITS)
    return `شماره کارت باید ۱۶ رقم باشد (اکنون ${count(digits)} رقم).`
  if (!isLuhnValid(digits)) return 'شماره کارت درست نیست؛ آن را دوباره بررسی کنید.'
  return null
}
