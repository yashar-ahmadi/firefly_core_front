import type { MenuNode } from '@/lib/api/types/settings'
import { storeHref } from '@/lib/links/store-href'

function MenuLinkItems({ nodes, siteUrl }: { nodes: MenuNode[]; siteUrl?: string }) {
  return nodes.map((node) => (
    <li key={node.id}>
      {node.url !== null && <a href={storeHref(node.url, siteUrl)}>{node.title}</a>}
      {node.children.length > 0 && (
        <ul>
          <MenuLinkItems nodes={node.children} siteUrl={siteUrl} />
        </ul>
      )}
    </li>
  ))
}

/**
 * The main menu as a hidden list of plain links, in the server's HTML (spec §8.13): the mega-menu
 * and the drawer load their panels when the visitor reaches for them, so without it their links
 * would not be in the page and crawlers would miss every category not linked elsewhere. Every
 * link the menus show, at every depth (a group heading without a URL adds only its children). A
 * Server Component of plain elements, so no client code; `hidden` keeps it out of the layout,
 * the accessibility tree and the tab order, and a plain `<a>` is never prefetched (a post's page
 * counts a view on every GET, P5-R1).
 */
export function MenuLinkTree({ items, siteUrl }: { items: MenuNode[]; siteUrl?: string }) {
  if (items.length === 0) return null
  return (
    <ul hidden>
      <MenuLinkItems nodes={items} siteUrl={siteUrl} />
    </ul>
  )
}
