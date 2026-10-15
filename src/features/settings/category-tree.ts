import type { CategoryCard, CategoryNode } from '@/lib/api/types/settings'

/**
 * Nest the flat `category/list/` result by `parent_id` in one pass. The API lists a parent before
 * its children (tree order), and that order is kept at every level. A node whose parent is not
 * in the list (or that names itself) becomes a root, and a repeated id (a page shifted while the
 * pages were being read) is ignored. The input cards are copied, not mutated.
 */
export function buildCategoryTree(cards: readonly CategoryCard[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>()
  for (const card of cards) {
    if (!nodes.has(card.id)) nodes.set(card.id, { ...card, children: [] })
  }

  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parent_id === null ? undefined : nodes.get(node.parent_id)
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}
