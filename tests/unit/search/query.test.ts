import { describe, expect, it } from 'vitest'
import { isSearchable, normalizeQuery, searchHref } from '@/features/search/query'

describe('normalizeQuery', () => {
  it('turns Persian and Arabic-Indic digits Latin and trims', () => {
    expect(normalizeQuery('  ۲۵ وات ')).toBe('25 وات')
    expect(normalizeQuery('\u{0662}\u{0665}')).toBe('25')
  })

  it('writes Arabic yeh, alef maksura and kaf the Persian way, as the API does', () => {
    expect(normalizeQuery('\u{0643}\u{064A}\u{0641}')).toBe('کیف')
    expect(normalizeQuery('گلکس\u{0649}')).toBe('گلکسی')
  })

  it('drops kashida and invisible controls, and reads a ZWNJ as a space', () => {
    expect(normalizeQuery('گـــوشی')).toBe('گوشی')
    expect(normalizeQuery('\u{202B}گوشی\u{202C}\u{200F}')).toBe('گوشی')
    expect(normalizeQuery('می\u{200C}بلین')).toBe('می بلین')
    expect(normalizeQuery('a\u{0}b')).toBe('ab')
  })

  it('collapses runs of spaces and keeps Latin case', () => {
    expect(normalizeQuery(' Galaxy \t  S25 ')).toBe('Galaxy S25')
  })
})

describe('isSearchable', () => {
  it('needs two characters after normalisation', () => {
    expect(isSearchable(normalizeQuery('گ'))).toBe(false)
    expect(isSearchable(normalizeQuery('ـگ'))).toBe(false)
    expect(isSearchable(normalizeQuery('گ\u{200C}'))).toBe(false)
    expect(isSearchable(normalizeQuery('۲'))).toBe(false)
    expect(isSearchable(normalizeQuery('۲۵'))).toBe(true)
    expect(isSearchable(normalizeQuery('گو'))).toBe(true)
  })

  it('counts characters, not UTF-16 units', () => {
    expect(isSearchable('\u{1F600}')).toBe(false)
  })
})

describe('searchHref', () => {
  it('is the results page for the term', () => {
    expect(searchHref('گوشی سامسونگ')).toBe(`/search/?q=${encodeURIComponent('گوشی سامسونگ')}`)
  })
})
