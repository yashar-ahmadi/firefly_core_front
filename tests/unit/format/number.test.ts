import { describe, expect, it } from 'vitest'
import { formatNumber, formatPercent, formatToman } from '@/lib/format/number'

describe('formatNumber', () => {
  it('uses Persian digits and Persian thousands separators', () => {
    expect(formatNumber(12500000)).toBe('۱۲٬۵۰۰٬۰۰۰')
    expect(formatNumber(0)).toBe('۰')
    expect(formatNumber(999)).toBe('۹۹۹')
    expect(formatNumber(1000)).toBe('۱٬۰۰۰')
  })

  it('uses the Persian decimal separator for fractions', () => {
    expect(formatNumber(12.5)).toBe('۱۲٫۵')
  })

  it('keeps the left-to-right mark Intl puts before the minus sign of negatives', () => {
    expect(formatNumber(-1200)).toBe('\u{200E}\u{2212}۱٬۲۰۰')
  })

  it('returns an empty string for NaN and infinities', () => {
    expect(formatNumber(Number.NaN)).toBe('')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatToman', () => {
  it('appends the Toman unit by default', () => {
    expect(formatToman(12500000)).toBe('۱۲٬۵۰۰٬۰۰۰ تومان')
    expect(formatToman(0)).toBe('۰ تومان')
  })

  it('can omit the unit', () => {
    expect(formatToman(1200, { suffix: false })).toBe('۱٬۲۰۰')
    expect(formatToman(1200, { suffix: true })).toBe('۱٬۲۰۰ تومان')
  })

  it('rounds to whole Toman', () => {
    expect(formatToman(1200.6)).toBe('۱٬۲۰۱ تومان')
  })

  it('returns an empty string for non-finite amounts', () => {
    expect(formatToman(Number.NaN)).toBe('')
    expect(formatToman(Number.NaN, { suffix: false })).toBe('')
  })
})

describe('formatPercent', () => {
  it('uses Persian digits and the Persian percent sign U+066A with no space', () => {
    expect(formatPercent(25)).toBe('۲۵٪')
    expect(formatPercent(25)).toContain('\u{066A}')
    expect(formatPercent(25)).not.toMatch(/\s/)
  })

  it('handles the 0 and 100 bounds', () => {
    expect(formatPercent(0)).toBe('۰٪')
    expect(formatPercent(100)).toBe('۱۰۰٪')
  })

  it('keeps one fraction digit at most', () => {
    expect(formatPercent(12.5)).toBe('۱۲٫۵٪')
    expect(formatPercent(33.333)).toBe('۳۳٫۳٪')
  })

  it('returns an empty string for non-finite input', () => {
    expect(formatPercent(Number.NaN)).toBe('')
  })
})
