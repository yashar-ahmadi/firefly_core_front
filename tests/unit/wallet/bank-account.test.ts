import { describe, expect, it } from 'vitest'
import {
  cardDigits,
  cardProblem,
  groupCard,
  groupSheba,
  isLuhnValid,
  isShebaValid,
  shebaDigits,
  shebaProblem,
  shownSheba,
} from '@/features/wallet/bank-account'
import { regroupField } from '@/features/wallet/digit-field'

// The withdrawal's bank account (order digest §2 `WithdrawalInput`, §7): the sheba is «IR» and 24
// digits, paste-friendly (spaces, dashes, a leading «IR» in any case, Persian and Arabic digits
// all accepted), checked by its ISO 13616 mod-97 checksum here too (the backend checks again);
// the optional card number is 16 digits with a valid Luhn check digit (a cross-check only).

const SHEBA = 'IR062960000000100324200001' // shirin's (accepted live)
const OTHER = 'IR450120000000004356789012'

describe('the sheba', () => {
  it('pasted with spaces, dashes and «IR» (any case), in Persian or Arabic digits', () => {
    expect(shebaDigits('IR06 2960 0000 0010 0324 2000 01')).toBe(SHEBA.slice(2))
    expect(shebaDigits('ir06-2960-0000-0010-0324-2000-01')).toBe(SHEBA.slice(2))
    expect(shebaDigits('IR۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱')).toBe(SHEBA.slice(2))
    expect(shebaDigits('٠٦٢٩٦٠٠٠٠٠٠٠١٠٠٣٢٤٢٠٠٠٠١')).toBe(SHEBA.slice(2))
    // More than 24 digits: the rest is dropped (a field that cannot run away).
    expect(shebaDigits(`${SHEBA}99`)).toHaveLength(24)
  })

  it('valid by its mod-97 checksum; one digit off is not', () => {
    expect(isShebaValid(SHEBA)).toBe(true)
    expect(isShebaValid(OTHER)).toBe(true)
    expect(isShebaValid('IR062960000000100324200002')).toBe(false)
    expect(isShebaValid('IR06296000000010032420000')).toBe(false)
    expect(isShebaValid('DE062960000000100324200001')).toBe(false)
  })

  it('what is wrong with it, in Persian', () => {
    expect(shebaProblem('')).toBe('شماره شبا را وارد کنید.')
    expect(shebaProblem('0629')).toBe('شماره شبا پس از IR باید ۲۴ رقم باشد (اکنون ۴ رقم).')
    expect(shebaProblem('062960000000100324200002')).toBe(
      'شماره شبا درست نیست؛ آن را دوباره بررسی کنید.',
    )
    expect(shebaProblem(SHEBA.slice(2))).toBeNull()
  })

  it('shown in groups of four, Persian digits', () => {
    expect(groupSheba('062960000000100324200001')).toBe('۰۶۲۹ ۶۰۰۰ ۰۰۰۰ ۱۰۰۳ ۲۴۲۰ ۰۰۰۱')
  })
})

describe('a sheba as shown (a request’s, as the API gives it)', () => {
  it('«IR» and its digits in groups, in Persian digits, left to right', () => {
    expect(shownSheba(SHEBA)).toBe('IR۰۶ ۲۹۶۰ ۰۰۰۰ ۰۰۱۰ ۰۳۲۴ ۲۰۰۰ ۰۱')
  })

  it('one of another length (the dev seed’s 25 characters): Persian digits, grouped all the same', () => {
    expect(shownSheba('IR41968675524242817077818')).toBe('IR۴۱ ۹۶۸۶ ۷۵۵۲ ۴۲۴۲ ۸۱۷۰ ۷۷۸۱ ۸')
    expect(shownSheba('ir41 9686-7552')).toBe('IR۴۱ ۹۶۸۶ ۷۵۵۲')
  })

  it('anything else: as given, its digits in Persian', () => {
    expect(shownSheba('DE89370400440532013000')).toBe('DE۸۹۳۷۰۴۰۰۴۴۰۵۳۲۰۱۳۰۰۰')
  })
})

describe('the card number (optional)', () => {
  it('16 digits, any script, separators ignored', () => {
    expect(cardDigits('6037-9912 3456 7893')).toBe('6037991234567893')
    expect(cardDigits('۶۰۳۷۹۹۱۲۳۴۵۶۷۸۹۳')).toBe('6037991234567893')
    expect(groupCard('6037991234567893')).toBe('۶۰۳۷ ۹۹۱۲ ۳۴۵۶ ۷۸۹۳')
  })

  it('Luhn: a valid check digit, and one that is not', () => {
    expect(isLuhnValid('6037991234567893')).toBe(true)
    expect(isLuhnValid('6037991234567890')).toBe(false)
  })

  it('left empty is fine; else 16 digits with a valid check digit', () => {
    expect(cardProblem('')).toBeNull()
    expect(cardProblem('6037')).toBe('شماره کارت باید ۱۶ رقم باشد (اکنون ۴ رقم).')
    expect(cardProblem('6037991234567890')).toBe('شماره کارت درست نیست؛ آن را دوباره بررسی کنید.')
    expect(cardProblem('6037991234567893')).toBeNull()
  })
})

describe('regroupField', () => {
  it('keeps the caret after the same digit while it regroups', () => {
    const field = { digits: cardDigits, show: groupCard }
    expect(regroupField('60379', 5, field)).toEqual({ text: '۶۰۳۷ ۹', caret: 6 })
    expect(regroupField('۶۰۳۷ ۹', 2, field)).toEqual({ text: '۶۰۳۷ ۹', caret: 2 })
  })
})
