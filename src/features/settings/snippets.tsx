import 'server-only'
import { getSnippets } from '@/features/settings/api'
import { renderSnippetNode, snippetNodes } from '@/features/settings/snippet-nodes'

export type SnippetSlot = 'in_head' | 'top_of_body' | 'bottom_of_body'

/** The API positions each layout slot renders; `outside_of_body` has no slot of its own. */
const POSITIONS: Record<SnippetSlot, readonly string[]> = {
  in_head: ['in_head'],
  top_of_body: ['top_of_body'],
  bottom_of_body: ['bottom_of_body', 'outside_of_body'],
}

/**
 * The operator's code snippets (`extra-snippets/`) for one slot of the root layout: `in_head`
 * inside <head>, `top_of_body` first in <body>, `bottom_of_body` (with `outside_of_body`) last.
 * API order is kept within the slot. Unknown positions are ignored.
 */
export async function Snippets({ position }: { position: SnippetSlot }) {
  const positions = POSITIONS[position]
  const placement = position === 'in_head' ? 'head' : 'body'
  const snippets = (await getSnippets()).filter((snippet) => positions.includes(snippet.position))
  return (
    <>
      {snippets.flatMap((snippet) =>
        snippetNodes(snippet, placement).map((node, index) =>
          renderSnippetNode(node, `${snippet.id}-${index}`),
        ),
      )}
    </>
  )
}
