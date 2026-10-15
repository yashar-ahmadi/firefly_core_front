import type { CategoryCard, CategoryNode } from '@/lib/api/types/settings'

/**
 * Nest the flat `category/list/` result by `parent_id` in one pass. The API lists a parent before
 * its children (tree order), and that order is kept at every level. A node whose parent is not
 * in the list (or that names itself) becomes a root, and a repeated id (a page shifted while the
 * pages were being read) is ignored. A longer parent cycle (a, b, a) cannot happen with the API's
 * tree, but would drop its nodes, so it is broken: one node of the loop becomes a root. The input
 * cards are copied, not mutated.
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

  // Whatever no root reaches hangs off a cycle: cut the loop at one of its nodes.
  const reachable = new Set<CategoryNode>()
  const markReachable = (start: CategoryNode) => {
    const pending = [start]
    for (let node = pending.pop(); node; node = pending.pop()) {
      if (reachable.has(node)) continue
      reachable.add(node)
      pending.push(...node.children)
    }
  }
  roots.forEach(markReachable)
  for (const node of nodes.values()) {
    if (reachable.has(node)) continue
    const loopNode = findLoopNode(node, nodes)
    const parent = nodes.get(loopNode.parent_id ?? -1)
    if (parent) parent.children = parent.children.filter((child) => child !== loopNode)
    roots.push(loopNode)
    markReachable(loopNode)
  }
  return roots
}

/** Follow parents from `node` until one repeats: that node is on the cycle. */
function findLoopNode(node: CategoryNode, nodes: Map<number, CategoryNode>): CategoryNode {
  const seen = new Set<CategoryNode>()
  let current = node
  while (!seen.has(current)) {
    seen.add(current)
    const parent = nodes.get(current.parent_id ?? -1)
    if (!parent) break
    current = parent
  }
  return current
}
