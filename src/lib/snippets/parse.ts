/**
 * Split operator-supplied head/body snippets (`extra-snippets/`) into nodes a React layout can
 * render: `<script>`, `<noscript>`, `<style>`, `<meta>` and `<link>` at the top level become typed
 * nodes, HTML comments are dropped, and everything else (text, other elements) is passed through
 * as `html`. A small scanner rather than a DOM parser: it also runs in the Node server render,
 * and snippets are short, trusted operator input. Pure: no `server-only`.
 */

export type SnippetNode =
  | { tag: 'script'; src?: string; inline?: string; attrs: Record<string, string> }
  | { tag: 'noscript' | 'style'; inline: string }
  | { tag: 'meta' | 'link'; attrs: Record<string, string> }
  | { tag: 'html'; inline: string }

interface StartTag {
  /** Lower-cased element name. */
  name: string
  /** Lower-cased names; a boolean attribute is ''; the first of a repeated name wins. */
  attrs: Record<string, string>
  selfClosing: boolean
  /** Index just after the closing '>'. */
  end: number
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Elements whose body runs to the first matching end tag, so it is never scanned for markup. */
const BODY_ELEMENTS = new Set(['script', 'style', 'noscript'])

const NAME_END = /[\s/>]/
const ATTR_NAME_END = /[\s/>=]/
const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(value: string): string {
  return value.replace(ENTITY, (match, dec?: string, hex?: string, named?: string) => {
    if (named) return NAMED_ENTITIES[named.toLowerCase()] ?? match
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? '', 16)
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match
  })
}

function skipSpaces(src: string, from: number): number {
  let i = from
  while (i < src.length && /\s/.test(src.charAt(i))) i++
  return i
}

/** Read the start tag at `from` (a '<'), or null when it is not one (text, end tag, unterminated). */
function readStartTag(src: string, from: number): StartTag | null {
  if (!/[a-z]/i.test(src.charAt(from + 1))) return null
  let i = from + 1
  while (i < src.length && !NAME_END.test(src.charAt(i))) i++
  const name = src.slice(from + 1, i).toLowerCase()

  const attrs: Record<string, string> = {}
  let selfClosing = false
  while (i < src.length) {
    i = skipSpaces(src, i)
    const ch = src.charAt(i)
    if (ch === '>') return { name, attrs, selfClosing, end: i + 1 }
    if (ch === '/') {
      selfClosing = src.charAt(i + 1) === '>'
      i++
      continue
    }
    const nameStart = i
    while (i < src.length && !ATTR_NAME_END.test(src.charAt(i))) i++
    if (i === nameStart) {
      i++ // a stray "=" or similar: skip it
      continue
    }
    const attr = src.slice(nameStart, i).toLowerCase()
    let value = ''
    i = skipSpaces(src, i)
    if (src.charAt(i) === '=') {
      i = skipSpaces(src, i + 1)
      const quote = src.charAt(i)
      if (quote === '"' || quote === "'") {
        const close = src.indexOf(quote, i + 1)
        if (close === -1) return null
        value = src.slice(i + 1, close)
        i = close + 1
      } else {
        const valueStart = i
        while (i < src.length && !/[\s>]/.test(src.charAt(i))) i++
        value = src.slice(valueStart, i)
      }
    }
    if (!Object.hasOwn(attrs, attr)) attrs[attr] = decodeEntities(value)
    selfClosing = false
  }
  return null
}

/** The first `</name>` at or after `from`, case-insensitively. */
function findEndTag(
  src: string,
  name: string,
  from: number,
): { start: number; end: number } | null {
  const pattern = new RegExp(`</${name}(?=[\\s/>])[^>]*>`, 'gi')
  pattern.lastIndex = from
  const match = pattern.exec(src)
  return match ? { start: match.index, end: match.index + match[0].length } : null
}

/** The end of the element opened by `tag`: past its matching end tag, or the end of the input. */
function findElementEnd(src: string, tag: StartTag): number {
  const pattern = new RegExp(`<(/?)${tag.name}(?=[\\s/>])`, 'gi')
  pattern.lastIndex = tag.end
  let depth = 1
  for (let match = pattern.exec(src); match; match = pattern.exec(src)) {
    depth += match[1] ? -1 : 1
    if (depth === 0) {
      const close = src.indexOf('>', match.index)
      return close === -1 ? src.length : close + 1
    }
  }
  return src.length
}

function scriptNode(attrs: Record<string, string>, body: string): SnippetNode {
  const src = attrs.src
  if (src) return { tag: 'script', src, attrs }
  const inline = body.trim()
  return inline === '' ? { tag: 'script', attrs } : { tag: 'script', inline, attrs }
}

export function parseSnippet(html: string): SnippetNode[] {
  if (typeof html !== 'string') return []
  const nodes: SnippetNode[] = []
  let loose = ''
  const flush = () => {
    if (loose.trim() !== '') nodes.push({ tag: 'html', inline: loose.trim() })
    loose = ''
  }

  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      loose += html.slice(i)
      break
    }
    loose += html.slice(i, lt)
    i = lt

    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4)
      i = close === -1 ? html.length : close + 3
      continue
    }

    const tag = readStartTag(html, i)
    if (!tag) {
      // An end tag, a doctype or a stray "<": text, up to the next '>' for the tag-like ones.
      const tagLike = /[/!?]/.test(html.charAt(i + 1))
      const close = tagLike ? html.indexOf('>', i) : -1
      const end = close === -1 ? i + 1 : close + 1
      loose += html.slice(i, end)
      i = end
      continue
    }

    if (tag.name === 'meta' || tag.name === 'link') {
      flush()
      nodes.push({ tag: tag.name, attrs: tag.attrs })
      i = tag.end
    } else if (BODY_ELEMENTS.has(tag.name)) {
      const close = findEndTag(html, tag.name, tag.end)
      const body = html.slice(tag.end, close ? close.start : html.length)
      i = close ? close.end : html.length
      flush()
      if (tag.name === 'script') nodes.push(scriptNode(tag.attrs, body))
      else nodes.push({ tag: tag.name as 'noscript' | 'style', inline: body.trim() })
    } else {
      const end =
        VOID_ELEMENTS.has(tag.name) || tag.selfClosing ? tag.end : findElementEnd(html, tag)
      loose += html.slice(i, end)
      i = end
    }
  }
  flush()
  return nodes
}
