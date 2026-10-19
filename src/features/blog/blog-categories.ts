import { blogCategoryPath } from '@/features/blog/blog-routes'
import type { BlogCategoryLight, BlogCategoryListItem } from '@/lib/api/types/blog'

// The blog's category list (`getBlogCategories`: published categories in tree pre-order, blog
// digest §1.6) as links. A category missing from it is a draft: it has no page. Pure.

/** Each published category's page, by id. */
export function categoryLinks(list: readonly BlogCategoryListItem[]): Map<number, string> {
  return new Map(list.map((category) => [category.id, blogCategoryPath(category.path)]))
}

/**
 * The direct children of `parentId`, in the API's order; for null, the top level, a child whose
 * parent is a draft (missing from the list) included.
 */
export function childCategories(
  list: readonly BlogCategoryListItem[],
  parentId: number | null,
): BlogCategoryListItem[] {
  if (parentId !== null) return list.filter((category) => category.parent_id === parentId)
  const ids = new Set(list.map((category) => category.id))
  return list.filter((category) => category.parent_id === null || !ids.has(category.parent_id))
}

export interface BlogCategoryNode {
  id: number
  name: string
  href: string
  children: BlogCategoryNode[]
}

/** The categories as a tree, built in one pass: an orphan (draft parent) is a root. */
export function categoryTree(list: readonly BlogCategoryListItem[]): BlogCategoryNode[] {
  const nodes = new Map<number, BlogCategoryNode>()
  const roots: BlogCategoryNode[] = []
  for (const category of list) {
    const node = {
      id: category.id,
      name: category.name,
      href: blogCategoryPath(category.path),
      children: [],
    }
    nodes.set(category.id, node)
  }
  for (const category of list) {
    const node = nodes.get(category.id)!
    const parent = category.parent_id === null ? undefined : nodes.get(category.parent_id)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** What a post card shows of its categories: a name, linked when it has a page. */
export interface PostCategoryLink {
  name: string
  href: string | null
}

/**
 * A post's first published category (linked), else its first one by name only (a draft has no
 * page); null for a post without categories.
 */
export function postCategory(
  categories: readonly BlogCategoryLight[],
  links: ReadonlyMap<number, string>,
): PostCategoryLink | null {
  const published = categories.find((category) => links.has(category.id))
  if (published) return { name: published.name, href: links.get(published.id) ?? null }
  const first = categories[0]
  return first ? { name: first.name, href: null } : null
}

/**
 * A visible trail's steps for a category chain (root→leaf, the API's `breadcrumb`): each linked
 * to its page when it has one (published), a draft named only.
 */
export function chainTrail(
  chain: readonly BlogCategoryLight[],
  links: ReadonlyMap<number, string>,
): { name: string; href?: string }[] {
  return chain.map((node) => {
    const href = links.get(node.id)
    return href ? { name: node.name, href } : { name: node.name }
  })
}
