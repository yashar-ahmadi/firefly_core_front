import { describe, expect, it } from 'vitest'
import {
  faqHaystack,
  matchesSearch,
  normalizeForSearch,
  searchTokens,
} from '@/features/faq/faq-search'

// The help centre's search runs in the browser over every question (blog-faq digest §2.2: the API
// has none). Persian-aware: the Arabic ي and ك a keyboard may type are the Persian ی and ک, a
// ZWNJ is a space, digits in any script are one digit, and a word typed with its ZWNJ, with a
// space instead or joined still matches.

const ARABIC_YEH = '\u{064A}'
const ARABIC_KAF = '\u{0643}'
const ZWNJ = '\u{200C}'

describe('normalizeForSearch', () => {
  it('reads the Arabic ي and ك as the Persian ی and ک', () => {
    expect(normalizeForSearch(`${ARABIC_KAF}الا${ARABIC_YEH}`)).toBe('کالای')
  })

  it('reads a ZWNJ as a space, collapses spaces and trims', () => {
    expect(normalizeForSearch(`  می${ZWNJ}شود   ارسال `)).toBe('می شود ارسال')
  })

  it('reads Persian and Arabic-Indic digits as Latin ones', () => {
    expect(normalizeForSearch('۱۲ ٣٤ 56')).toBe('12 34 56')
  })

  it('ignores Latin case, the tatweel and the short-vowel marks', () => {
    expect(normalizeForSearch('VISA کـــارت مُرسوله')).toBe('visa کارت مرسوله')
  })
})

describe('matchesSearch', () => {
  const haystack = faqHaystack('هزینه ارسال چطور محاسبه می شود؟', 'بر اساس وزن مرسوله، ۲ روز کاری')
  const found = (query: string) => matchesSearch(haystack, searchTokens(query))

  it('matches every word of the query, in any order, in the question or the answer', () => {
    expect(found('ارسال هزینه')).toBe(true)
    expect(found('مرسوله وزن')).toBe(true)
    expect(found('هزینه گارانتی')).toBe(false)
  })

  it('matches across the Arabic and Persian letters, and across digit scripts', () => {
    expect(found(`هز${ARABIC_YEH}نه`)).toBe(true)
    expect(found('2 روز')).toBe(true)
  })

  it('matches a word typed with its ZWNJ, with a space, or joined', () => {
    expect(found(`می${ZWNJ}شود`)).toBe(true)
    expect(found('می شود')).toBe(true)
    expect(found('میشود')).toBe(true)
  })

  it('a query of spaces alone has no words', () => {
    expect(searchTokens(`  ${ZWNJ} `)).toEqual([])
  })
})
