import type { ReactNode } from 'react'
import type { Snippet } from '@/lib/api/types/settings'
import { parseSnippet, type SnippetNode } from '@/lib/snippets/parse'

/**
 * Turns the operator's head/body snippets into React elements. Server-rendered HTML runs the
 * scripts on page load; React never re-creates them, because the root layout does not re-render
 * on client navigation. Snippets are trusted operator code and stay unsanitised by design
 * (analytics must execute); only attributes React cannot render from markup are dropped, with a
 * warning.
 * Pure: no `server-only`.
 */

export type SnippetPlacement = 'head' | 'body'

/** Problems already reported, so a broken snippet warns once per process, not per request. */
const reported = new Set<string>()

function warnOnce(snippet: Snippet, problem: string): void {
  const key = `${snippet.id}:${problem}`
  if (reported.has(key)) return
  reported.add(key)
  // Never the code itself: it can carry tracking ids or keys.
  console.warn(`[snippets] snippet ${snippet.id} (${snippet.type}, ${snippet.position}) ${problem}`)
}

/**
 * Bare code is written into a <script> or <style> element as raw text, and the HTML parser ends
 * that element at the first `</script` (`</style`) in any letter case: escape it as `<\/script`.
 * In a script, `<!--` followed by `<script` would also keep the parser from ever seeing the real
 * end tag (the rest of the page would become script text): escape it as `\x3C!--`, as the HTML
 * spec advises. Both keep their meaning in strings, template literals, regular expressions and
 * comments (and CSS strings). Snippets written as HTML keep their scripts exactly as written.
 */
function escapeScriptText(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\x3C!--')
}

function escapeStyleText(code: string): string {
  return code.replace(/<\/(style)/gi, '<\\/$1')
}

/**
 * The render-ready nodes of one snippet. Complete HTML (it starts with '<') is parsed; anything
 * else is wrapped by `type` (script or style), escaped so it cannot end its wrapper early. Meta
 * and link snippets must be HTML, and loose HTML has no place in <head>: both are skipped with a
 * warning.
 */
export function snippetNodes(snippet: Snippet, placement: SnippetPlacement): SnippetNode[] {
  const code = snippet.snippet.trim()
  if (code === '') return []
  if (!code.startsWith('<')) {
    if (snippet.type === 'script') {
      return [{ tag: 'script', inline: escapeScriptText(code), attrs: {} }]
    }
    if (snippet.type === 'style') return [{ tag: 'style', inline: escapeStyleText(code) }]
    warnOnce(snippet, 'is not HTML and its type cannot wrap it; skipped')
    return []
  }
  const nodes = parseSnippet(code)
  warnDroppedAttributes(snippet, nodes)
  if (placement === 'body') return nodes
  const headNodes = nodes.filter((node) => node.tag !== 'html')
  if (headNodes.length < nodes.length) {
    warnOnce(snippet, 'has HTML that cannot go in <head>; skipped')
  }
  return headNodes
}

/** HTML attribute names whose React prop is spelled differently. */
const PROP_NAMES: Record<string, string> = {
  class: 'className',
  charset: 'charSet',
  crossorigin: 'crossOrigin',
  fetchpriority: 'fetchPriority',
  hreflang: 'hrefLang',
  'http-equiv': 'httpEquiv',
  imagesizes: 'imageSizes',
  imagesrcset: 'imageSrcSet',
  itemprop: 'itemProp',
  nomodule: 'noModule',
  referrerpolicy: 'referrerPolicy',
}

const BOOLEAN_ATTRIBUTES = new Set(['async', 'defer', 'nomodule', 'disabled'])

/**
 * Names React would read as its own props (`key`, `ref`, `children`...) or reject as a string
 * (`style`, `on*` handlers).
 */
function isUnrenderable(name: string): boolean {
  return (
    name.startsWith('on') ||
    ['key', 'ref', 'children', 'style', 'dangerouslysetinnerhtml'].includes(name)
  )
}

/** Report, by name only, the attributes the renderer will leave out (an `onload` handler, say). */
function warnDroppedAttributes(snippet: Snippet, nodes: SnippetNode[]): void {
  const dropped = new Set<string>()
  for (const node of nodes) {
    if (!('attrs' in node)) continue
    for (const name of Object.keys(node.attrs)) if (isUnrenderable(name)) dropped.add(name)
  }
  if (dropped.size > 0) {
    warnOnce(snippet, `dropped attributes React cannot render: ${[...dropped].join(', ')}`)
  }
}

function toProps(attrs: Record<string, string>): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {}
  for (const [name, value] of Object.entries(attrs)) {
    if (isUnrenderable(name)) continue
    props[PROP_NAMES[name] ?? name] = BOOLEAN_ATTRIBUTES.has(name) ? true : value
  }
  return props
}

/**
 * One node as an element. React 19 keeps `<meta>`, `<link>` and `async` external scripts in the
 * head wherever they are rendered; everything else stays in place. Loose HTML (a trust seal, a
 * widget's mount point) is visible markup: the snippet zones (snippets.tsx) decide where it goes.
 */
export function renderSnippetNode(node: SnippetNode, key: string): ReactNode {
  switch (node.tag) {
    case 'script':
      if (node.src) {
        // The operator's own choice: a script without async or defer must keep blocking, since
        // the snippets after it may depend on it.
        // eslint-disable-next-line @next/next/no-sync-scripts
        return <script key={key} {...toProps(node.attrs)} src={node.src} />
      }
      if (node.inline === undefined) return null
      return (
        <script
          key={key}
          {...toProps(node.attrs)}
          dangerouslySetInnerHTML={{ __html: node.inline }}
        />
      )
    case 'style':
      return <style key={key} dangerouslySetInnerHTML={{ __html: node.inline }} />
    case 'noscript':
      return <noscript key={key} dangerouslySetInnerHTML={{ __html: node.inline }} />
    case 'meta':
      return <meta key={key} {...toProps(node.attrs)} />
    case 'link':
      return <link key={key} {...toProps(node.attrs)} />
    case 'html':
      return (
        <div
          key={key}
          // Third-party code (a seal's own script) may rewrite this markup before hydration.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: node.inline }}
        />
      )
  }
}
