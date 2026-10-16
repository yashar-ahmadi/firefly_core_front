// The search term the way the API reads it (content digest §7.1). Pure: safe in any bundle.
//
// Escapes use the `\u{…}` form with the `u` flag on purpose: it survives tools that expand
// four-digit `\uXXXX` sequences into invisible literal characters.

import { toLatinDigits } from '@/lib/format/digits'

/** The API refuses a raw `q` longer than this: the inputs stop there too. */
export const MAX_QUERY_LENGTH = 200
/** The API's minimum, in characters, once normalised. */
const MIN_QUERY_LENGTH = 2

const ARABIC_LETTERS: Record<string, string> = {
  '\u{064A}': '\u{06CC}',
  '\u{0649}': '\u{06CC}',
  '\u{0643}': '\u{06A9}',
}
const ARABIC_LETTER = /[\u{064A}\u{0649}\u{0643}]/gu

/**
 * Invisible characters the API removes: control characters other than whitespace, bidi
 * embeddings, overrides, isolates and marks, zero-width space and joiner, word joiner, BOM,
 * U+FFFE/U+FFFF, and the kashida (tatweel).
 */
const INVISIBLE =
  /[\u{0000}-\u{0008}\u{000E}-\u{001F}\u{007F}-\u{009F}\u{200B}\u{200D}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}\u{FFFE}\u{FFFF}\u{0640}]/gu
const ZWNJ = /\u{200C}/gu

/**
 * `q` as the API normalises it before searching and checking its length: digits Latin, Arabic
 * yeh, alef maksura and kaf Persian, invisible characters and kashida dropped, ZWNJ read as a
 * space, runs of spaces collapsed, trimmed. Latin case is kept. The operator's ignored words
 * («خرید»…) are the one step left out: the API alone knows them, so a term this calls
 * searchable can still be refused.
 */
export function normalizeQuery(raw: string): string {
  return toLatinDigits(raw)
    .replace(ARABIC_LETTER, (letter) => ARABIC_LETTERS[letter] ?? letter)
    .replace(INVISIBLE, '')
    .replace(ZWNJ, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Whether a normalised term is long enough for the API: two characters (code points). */
export function isSearchable(term: string): boolean {
  return Array.from(term).length >= MIN_QUERY_LENGTH
}

/** The results page for a term. */
export function searchHref(term: string): string {
  return `/search/?q=${encodeURIComponent(term)}`
}
