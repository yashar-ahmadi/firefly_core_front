import { describe, expect, it } from 'vitest'
import { toLatinDigits, toPersianDigits } from '@/lib/format/digits'

describe('toPersianDigits', () => {
  it('converts ASCII digits and leaves other characters alone', () => {
    expect(toPersianDigits('S25 128')).toBe('S۲۵ ۱۲۸')
  })

  it('accepts numbers', () => {
    expect(toPersianDigits(1405)).toBe('۱۴۰۵')
    expect(toPersianDigits(0)).toBe('۰')
    expect(toPersianDigits(-12.5)).toBe('-۱۲.۵')
  })

  it('converts all ten digits', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹')
  })

  it('normalises Arabic-Indic digits to the Persian forms', () => {
    expect(toPersianDigits('٠١٢٣٤٥٦٧٨٩')).toBe('۰۱۲۳۴۵۶۷۸۹')
  })

  it('is idempotent on Persian digits and empty input', () => {
    expect(toPersianDigits('۱۲۳')).toBe('۱۲۳')
    expect(toPersianDigits('')).toBe('')
  })
})

describe('toLatinDigits', () => {
  it('converts mixed Persian and Arabic-Indic digits to ASCII', () => {
    expect(toLatinDigits('۰۹۱۲٣٤٥')).toBe('0912345')
  })

  it('converts all ten digits of both scripts', () => {
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
  })

  it('leaves ASCII digits and other characters alone', () => {
    expect(toLatinDigits('S۲۵ 128 تومان')).toBe('S25 128 تومان')
    expect(toLatinDigits('')).toBe('')
  })
})
