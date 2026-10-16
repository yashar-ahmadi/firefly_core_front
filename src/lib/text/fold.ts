// Text folding for client-side matching of Persian names (brand search in the filters).
// Pure: safe in Server and Client Components.
//
// Escapes use the `\u{…}` form with the `u` flag on purpose: it survives tools that expand
// four-digit `\uXXXX` sequences into invisible literal characters.

import { toLatinDigits } from '@/lib/format/digits'

/** Arabic yeh, alef maksura and kaf, as keyboards and old data still type them. */
const ARABIC_LETTERS: Record<string, string> = {
  '\u{064A}': '\u{06CC}',
  '\u{0649}': '\u{06CC}',
  '\u{0643}': '\u{06A9}',
}
const ARABIC_LETTER = /[\u{064A}\u{0649}\u{0643}]/gu

/**
 * Whitespace, the zero-width joiners (ZWNJ is how «می‌بلین» and «میبلین» differ), kashida, and
 * the Arabic diacritics and superscript alef.
 */
const IGNORED = /[\s\u{200C}\u{200D}\u{0640}\u{064B}-\u{065F}\u{0670}]/gu

/**
 * A key for "does this name contain what the shopper typed": Arabic letter variants become
 * Persian, digits Latin, Latin letters lower case, and spacing, ZWNJ, kashida and diacritics
 * are dropped. Compare folded text with folded text only.
 */
export function foldForSearch(value: string): string {
  return toLatinDigits(value)
    .replace(ARABIC_LETTER, (letter) => ARABIC_LETTERS[letter] ?? letter)
    .replace(IGNORED, '')
    .toLowerCase()
}
