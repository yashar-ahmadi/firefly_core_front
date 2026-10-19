// The help centre's search (blog-faq digest §2.2: the API has none, so it runs in the browser over
// every question). Persian-aware matching. Pure and tiny: the browser's FAQ code imports it.

/** The Arabic letters a keyboard may type for the Persian ones. */
const LETTERS: Record<string, string> = {
  '\u{064A}': 'ی', // Arabic yeh
  '\u{0649}': 'ی', // Arabic alef maksura
  '\u{0643}': 'ک', // Arabic kaf
}
const ARABIC_LETTER = /[\u{064A}\u{0649}\u{0643}]/gu
/** Persian (۰–۹) and Arabic-Indic (٠–٩) digits. */
const EASTERN_DIGIT = /[\u{06F0}-\u{06F9}\u{0660}-\u{0669}]/gu
/** The short-vowel marks and the tatweel: never part of what a visitor types to find a word. */
const MARKS = /[\u{064B}-\u{065F}\u{0670}\u{0640}]/gu
/** The ZWNJ and the other joiners and direction marks: a word typed with or without them. */
const JOINERS = /[\u{200B}-\u{200F}\u{FEFF}]/gu

/**
 * `text` as the search compares it: the Arabic ي, ى and ك as the Persian ی and ک, Persian and
 * Arabic-Indic digits as Latin ones, no short-vowel marks or tatweel, a ZWNJ (and the other
 * joiners) as a space, spaces collapsed and trimmed, Latin letters in lower case.
 */
export function normalizeForSearch(text: string): string {
  return (
    text
      .replace(ARABIC_LETTER, (letter) => LETTERS[letter] ?? letter)
      // ۰ is U+06F0 and ٠ is U+0660: in both scripts the code point's last hex digit is the digit.
      .replace(EASTERN_DIGIT, (digit) => String((digit.codePointAt(0) ?? 0) % 16))
      .replace(MARKS, '')
      .replace(JOINERS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  )
}

/** The query's words, normalised; none for a query of spaces. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeForSearch(query)
  return normalized === '' ? [] : normalized.split(' ')
}

/** What a question is searched by: its text and its answer's, normalised, with and without spaces. */
export interface FaqHaystack {
  spaced: string
  joined: string
}

export function faqHaystack(question: string, answerText: string): FaqHaystack {
  const spaced = normalizeForSearch(`${question} ${answerText}`)
  return { spaced, joined: spaced.replaceAll(' ', '') }
}

/**
 * Whether every word of the query is in the question or its answer, in any order. A word is also
 * found with the spaces of the text left out, so «میشود» finds «می شود» (and the word with its ZWNJ).
 */
export function matchesSearch(haystack: FaqHaystack, tokens: readonly string[]): boolean {
  return tokens.every((token) => haystack.spaced.includes(token) || haystack.joined.includes(token))
}
