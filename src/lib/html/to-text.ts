// Operator HTML (the announcement, say) as one line of plain text. Rendering the text, never the
// markup, makes it safe without a sanitiser. Pure: safe in Server and Client Components.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  zwnj: '\u{200C}',
  zwj: '\u{200D}',
  lrm: '\u{200E}',
  rlm: '\u{200F}',
}

/** Removed with their content: nothing in them is text a visitor reads. */
const HIDDEN = /<!--[\s\S]*?-->|<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi
/** A tag; a `>` inside a quoted attribute value (`title="a>b"`) does not end it. */
const TAG = /<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi
/** Tags inside a line of text; any other tag (p, br, li, div…) separates words. */
const INLINE_TAG = /^<\/?(?:a|abbr|b|bdi|bdo|em|i|mark|small|span|strong|sub|sup|u)\b/i
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith('#')) {
    const hex = body[1] === 'x' || body[1] === 'X'
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity
}

/**
 * Strip the tags (and the content of scripts, styles and comments), decode entities once and
 * collapse whitespace. `null` and markup without text give ''.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(HIDDEN, '')
    .replace(TAG, (tag) => (INLINE_TAG.test(tag) ? '' : ' '))
    .replace(ENTITY, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim()
}
