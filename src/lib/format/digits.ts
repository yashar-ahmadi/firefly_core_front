// Digit conversion between ASCII, Persian (U+06F0-06F9) and Arabic-Indic (U+0660-0669).
// Pure helpers: safe to import from Server and Client Components alike.
//
// Escapes use the `\u{…}` form with the `u` flag on purpose: it survives tools that expand
// four-digit `\uXXXX` sequences into invisible literal characters.

const PERSIAN_ZERO = 0x06f0
const ARABIC_INDIC_ZERO = 0x0660

const ASCII_DIGIT = /[0-9]/g
const ARABIC_INDIC_DIGIT = /[\u{0660}-\u{0669}]/gu
const PERSIAN_DIGIT = /[\u{06F0}-\u{06F9}]/gu

/**
 * Convert ASCII digits (and Arabic-Indic digits, whose glyphs differ from the Persian ones)
 * to Persian digits. Every other character is left untouched.
 */
export function toPersianDigits(value: string | number): string {
  return String(value)
    .replace(ASCII_DIGIT, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)))
    .replace(ARABIC_INDIC_DIGIT, (d) =>
      String.fromCharCode(PERSIAN_ZERO + d.charCodeAt(0) - ARABIC_INDIC_ZERO),
    )
}

/** Convert Persian and Arabic-Indic digits to ASCII digits. Other characters are untouched. */
export function toLatinDigits(value: string): string {
  return value
    .replace(PERSIAN_DIGIT, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))
    .replace(ARABIC_INDIC_DIGIT, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
}
