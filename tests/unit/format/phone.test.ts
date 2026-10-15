import { describe, expect, it } from 'vitest'
import { formatIranMobile, isIranMobile, normalizeIranMobile } from '@/lib/format/phone'

describe('normalizeIranMobile', () => {
  it.each([
    ['09121234567'],
    ['9121234567'],
    ['+989121234567'],
    ['00989121234567'],
    ['989121234567'],
    ['+98 912 123 4567'],
    ['0912-123-4567'],
    ['(0912) 123 4567'],
    ['+98 (0)912 123 4567'],
    ['۰۹۱۲۱۲۳۴۵۶۷'],
    ['٠٩١٢١٢٣٤٥٦٧'],
    ['۰۰۹۸۹۱۲۱۲۳۴۵۶۷'],
    ['۰۹۱۲ ۱۲۳ ۴۵۶۷'],
    ['  09121234567  '],
    ['0912\u{200C}123\u{200C}4567'],
  ])('normalises %s to 09121234567', (input) => {
    expect(normalizeIranMobile(input)).toBe('09121234567')
  })

  it('returns null for landlines', () => {
    expect(normalizeIranMobile('+982191000000')).toBeNull()
    expect(normalizeIranMobile('02191000000')).toBeNull()
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['0912123456'], // one digit short
    ['091212345678'], // one digit long
    ['08121234567'], // not a mobile number
    ['+14155550123'],
    ['+98912123456'],
    ['9121234567x'],
    ['09121234567+'],
    ['+++989121234567'],
  ])('returns null for %j', (input) => {
    expect(normalizeIranMobile(input)).toBeNull()
  })
})

describe('isIranMobile', () => {
  it('accepts every supported spelling', () => {
    expect(isIranMobile('9121234567')).toBe(true)
    expect(isIranMobile('+989121234567')).toBe(true)
    expect(isIranMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isIranMobile('+982191000000')).toBe(false)
    expect(isIranMobile('')).toBe(false)
    expect(isIranMobile('12345')).toBe(false)
  })
})

describe('formatIranMobile', () => {
  it('formats E.164 as 0912 123 4567 in Persian digits', () => {
    expect(formatIranMobile('+989121234567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷')
  })

  it('accepts every input normalizeIranMobile accepts', () => {
    expect(formatIranMobile('09121234567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷')
    expect(formatIranMobile('9121234567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷')
    expect(formatIranMobile('۰۰۹۸۹۱۲۱۲۳۴۵۶۷')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷')
    expect(formatIranMobile('0912-123-4567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷')
  })

  it('formats a landline without throwing', () => {
    expect(formatIranMobile('+982191000000')).toBe('۰۲۱ ۹۱۰۰ ۰۰۰۰')
    expect(formatIranMobile('02191000000')).toBe('۰۲۱ ۹۱۰۰ ۰۰۰۰')
    expect(formatIranMobile('۰۲۱-۹۱۰۰۰۰۰۰')).toBe('۰۲۱ ۹۱۰۰ ۰۰۰۰')
  })

  it('falls back to a Persian-digit rendering of anything else', () => {
    expect(formatIranMobile('+14155550123')).toBe('+۱۴۱۵۵۵۵۰۱۲۳')
    expect(formatIranMobile('12345')).toBe('۱۲۳۴۵')
    expect(formatIranMobile('')).toBe('')
  })
})
