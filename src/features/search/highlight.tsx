import type { ReactNode } from 'react'
import { foldForSearch } from '@/lib/text/fold'
import { normalizeQuery } from './query'

// Marks what a suggestion has in common with the typed term. The API returns no highlight
// markup (content digest §7.1), so this matches on the client, folding both sides the way the
// search reads them («۲۵» finds «25», «كيف» finds «کیف», ZWNJ and kashida are ignored).
//
// Escapes use the `\u{…}` form on purpose: it survives tools that expand four-digit `\uXXXX`
// sequences into invisible literal characters.

export type MatchRange = [start: number, end: number]

/** Letters that connect to the letter after them (dual-joining, and the kashida). */
const JOINS_NEXT = new Set(Array.from('ئبتثجحخسشصضطظعغفقكلمنهىيپچکگیھـ'))
/** Letters that connect to the letter before them: the above and the right-joining ones. */
const JOINS_PREVIOUS = new Set([...JOINS_NEXT, ...Array.from('آأؤإاةدذرزوژۀٱ')])
const ZWJ = '\u{200D}'

/**
 * `text` folded character by character, with each folded UTF-16 unit's source range, so a
 * match in the folded text maps back onto the original characters.
 */
function foldWithSources(text: string): { folded: string; from: number[]; to: number[] } {
  let folded = ''
  const from: number[] = []
  const to: number[] = []
  let index = 0
  for (const char of text) {
    const piece = foldForSearch(char)
    for (let unit = 0; unit < piece.length; unit += 1) {
      from.push(index)
      to.push(index + char.length)
    }
    folded += piece
    index += char.length
  }
  return { folded, from, to }
}

function merge(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: MatchRange[] = []
  for (const [start, end] of sorted) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/**
 * Where each word of `query` occurs in `text` (any order, every occurrence), as sorted,
 * merged [start, end) ranges of `text`. Both are folded with `foldForSearch`.
 */
export function matchRanges(text: string, query: string): MatchRange[] {
  const words = new Set(normalizeQuery(query).split(' ').map(foldForSearch).filter(Boolean))
  if (words.size === 0) return []
  const { folded, from, to } = foldWithSources(text)
  const ranges: MatchRange[] = []
  for (const word of words) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + word.length)) {
      ranges.push([from[at]!, to[at + word.length - 1]!])
    }
  }
  return merge(ranges)
}

/** Whether the letters on either side of `index` are joined in writing. */
function joinedAt(text: string, index: number): boolean {
  const before = text[index - 1]
  const after = text[index]
  return (
    before !== undefined &&
    after !== undefined &&
    JOINS_NEXT.has(before) &&
    JOINS_PREVIOUS.has(after)
  )
}

/** text[start, end), with a ZWJ at each end that cuts through a joined pair of letters. */
function piece(text: string, start: number, end: number): string {
  return `${joinedAt(text, start) ? ZWJ : ''}${text.slice(start, end)}${joinedAt(text, end) ? ZWJ : ''}`
}

/**
 * `text` with the matches of `query` in `<mark>`. RTL-safe:
 * - the marks set no direction and isolate nothing, so the bidi order of mixed Persian and
 *   Latin text is the same as without them;
 * - where a mark starts or ends inside a word, between two letters that join, a zero-width
 *   joiner goes on both sides, so each part keeps its joined letter forms even in a browser
 *   that shapes every element on its own (a mark in another weight, say).
 */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const ranges = matchRanges(text, query)
  if (ranges.length === 0) return text
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(piece(text, cursor, start))
    parts.push(
      <mark key={start} className="bg-transparent font-bold text-brand-700">
        {piece(text, start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) parts.push(piece(text, cursor, text.length))
  return parts
}
