import { htmlToText } from '@/lib/html/to-text'

// A post's reading time (blog digest §1.5: the API gives none). Pure.

/** Words a minute. */
const WORDS_PER_MINUTE = 200

/**
 * Minutes to read `html`: its words (the text between spaces, tags left out) ÷ 200, rounded up,
 * at least 1.
 */
export function readingMinutes(html: string | null): number {
  const text = htmlToText(html)
  const words = text === '' ? 0 : text.split(/\s+/u).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}
