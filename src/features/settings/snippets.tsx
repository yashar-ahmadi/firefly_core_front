import 'server-only'
import { getSnippets } from '@/features/settings/api'
import { renderSnippetNode, snippetNodes } from '@/features/settings/snippet-nodes'
import type { SnippetNode } from '@/lib/snippets/parse'

export type SnippetSlot = 'in_head' | 'top_of_body' | 'bottom_of_body'
export type SnippetZone = 'top' | 'bottom'

/** The API positions each layout slot renders; `outside_of_body` has no slot of its own. */
const POSITIONS: Record<SnippetSlot, readonly string[]> = {
  in_head: ['in_head'],
  top_of_body: ['top_of_body'],
  bottom_of_body: ['bottom_of_body', 'outside_of_body'],
}

const ZONE_SLOTS: Record<SnippetZone, SnippetSlot> = {
  top: 'top_of_body',
  bottom: 'bottom_of_body',
}

/** The slot's nodes in API order, keyed for React. */
async function slotNodes(slot: SnippetSlot): Promise<Array<{ key: string; node: SnippetNode }>> {
  const positions = POSITIONS[slot]
  const placement = slot === 'in_head' ? 'head' : 'body'
  const snippets = (await getSnippets()).filter((snippet) => positions.includes(snippet.position))
  return snippets.flatMap((snippet) =>
    snippetNodes(snippet, placement).map((node, index) => ({
      key: `${snippet.id}-${index}`,
      node,
    })),
  )
}

/**
 * The operator's code (`extra-snippets/`) for one slot of the root layout: `in_head` inside
 * <head>, `top_of_body` first in <body>, `bottom_of_body` (with `outside_of_body`) last. Scripts,
 * styles, noscript, meta and link only: loose HTML is visible content and renders in
 * `<SnippetHtmlZone>`. API order is kept within the slot; unknown positions are ignored.
 */
export async function Snippets({ position }: { position: SnippetSlot }) {
  const nodes = (await slotNodes(position)).filter(({ node }) => node.tag !== 'html')
  return <>{nodes.map(({ key, node }) => renderSnippetNode(node, key))}</>
}

const ZONE_CLASSES: Record<SnippetZone, string | undefined> = {
  top: undefined,
  bottom: 'flex flex-wrap items-center justify-center gap-4 px-4 py-6',
}

/**
 * The visible HTML of the body snippets (trust seals such as eNamad, a widget's mount point):
 * `top` holds `top_of_body`, `bottom` holds `bottom_of_body` and `outside_of_body`, centred.
 * Render each zone once, before its slot's `<Snippets>`, so the markup exists when the scripts
 * run. The root layout places `top` right after <body> opens and `bottom` at the end of the
 * page; the footer can take `bottom` instead. Nothing is rendered without HTML.
 */
export async function SnippetHtmlZone({ position }: { position: SnippetZone }) {
  const nodes = (await slotNodes(ZONE_SLOTS[position])).filter(({ node }) => node.tag === 'html')
  if (nodes.length === 0) return null
  return (
    <div data-snippet-zone={position} className={ZONE_CLASSES[position]}>
      {nodes.map(({ key, node }) => renderSnippetNode(node, key))}
    </div>
  )
}
