import { describe, expect, it } from 'vitest'
import { foldForSearch } from '@/lib/text/fold'

describe('foldForSearch', () => {
  it('maps Arabic yeh, alef maksura and kaf to their Persian letters', () => {
    expect(foldForSearch('\u{064A}\u{0649}\u{0643}')).toBe('\u{06CC}\u{06CC}\u{06A9}')
    expect(foldForSearch('ش\u{064A}ائوم\u{064A}')).toBe(foldForSearch('شیائومی'))
  })

  it('ignores whitespace, ZWNJ, ZWJ, kashida and diacritics', () => {
    const plain = foldForSearch('میبلین')
    for (const variant of [
      'می بلین',
      'می\u{200C}بلین',
      'می\u{200D}بلین',
      'می\u{0640}بلین',
      ' میبلین ',
    ]) {
      expect(foldForSearch(variant), variant).toBe(plain)
    }
    expect(foldForSearch('ک\u{0650}تاب')).toBe(foldForSearch('کتاب'))
  })

  it('lowercases Latin letters and unifies digits', () => {
    expect(foldForSearch('XiaoMi ۱۲')).toBe('xiaomi12')
    expect(foldForSearch('٣')).toBe('3')
  })
})
