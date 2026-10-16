import type { CategoryNode, MenuNode } from '@/lib/api/types/settings'

// Pure helpers for the shell's menus: category links, the main-menu fallback and the active
// state (own-origin links: storeHref in @/lib/links/store-href). Safe in Server and Client
// Components.

/** What the shell needs of a category: sent to the browser instead of the full card. */
export interface CategoryLinkNode {
  id: number
  name: string
  /** "digital/mobile-phone": the link is built from it, never from the slug. */
  path: string
  image: string
  icon: string
  children: CategoryLinkNode[]
}

/** `/product-category/{path}/` (content.md: category links use the full path). */
export function categoryHref(path: string): string {
  return `/product-category/${path}/`
}

/** The API sends `/static/defaults/default.png` (a grey frame) for a missing image or icon. */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  return !url || url.includes('/static/defaults/')
}

/** Drop the card fields the browser never uses (dates, counts, descriptions). */
export function slimCategories(nodes: readonly CategoryLinkNode[]): CategoryLinkNode[] {
  return nodes.map(({ id, name, path, image, icon, children }) => ({
    id,
    name,
    path,
    image,
    icon,
    children: slimCategories(children),
  }))
}

/** The category tree as menu items, so the mega-menu can render it like `menu/main`. */
export function categoriesToMenu(nodes: readonly CategoryLinkNode[]): MenuNode[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.name,
    link_type: 'product_category',
    url: categoryHref(node.path),
    open_in_new_tab: false,
    icon: isPlaceholderImage(node.icon) ? null : node.icon,
    target: { type: 'product_category', id: node.id, slug: node.path.split('/').at(-1) ?? '' },
    children: categoriesToMenu(node.children),
  }))
}

/** The operator's `main` menu, or the category tree while that menu is empty. */
export function navItems(
  menu: MenuNode[],
  categories: readonly (CategoryLinkNode | CategoryNode)[],
): MenuNode[] {
  return menu.length > 0 ? menu : categoriesToMenu(categories)
}

function normalizePath(path: string): string {
  let decoded = path
  try {
    decoded = decodeURI(path)
  } catch {
    // Keep a malformed path as it is.
  }
  return decoded.endsWith('/') ? decoded : `${decoded}/`
}

/**
 * Whether a menu URL is the current page. Only plain storefront paths take part: a link with a
 * query (a filtered list) or another site is never marked current.
 */
export function isActivePath(url: string | null, pathname: string): boolean {
  if (!url || !url.startsWith('/') || /[?#]/.test(url)) return false
  return normalizePath(url) === normalizePath(pathname)
}
