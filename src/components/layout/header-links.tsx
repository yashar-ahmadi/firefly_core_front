'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/components/ui/cn'
import { DeferredMenu } from '@/components/ui/deferred-menu'
import type { MenuNode } from '@/lib/api/types/settings'
import { loadPage, reloadPage } from '@/lib/navigation/hard-navigation'
import { MenuIcon, MenuLink } from './menu-link'
import { isActivePath } from './menu-tree'
import { HEADER_LINK } from './nav-styles'

const loadHeaderDropdown = () => import('./header-dropdown').then((module) => module.HeaderDropdown)

/**
 * A header item with children: a menu of them, whose code loads on first use (DeferredMenu). If
 * that code cannot be downloaded, the item's own page opens, or the page reloads with fresh
 * code when the item has none.
 */
function HeaderMenuButton({ item, pathname }: { item: MenuNode; pathname: string }) {
  return (
    <DeferredMenu
      load={loadHeaderDropdown}
      props={{ item, pathname }}
      onUnavailable={() => (item.url !== null ? loadPage(item.url) : reloadPage())}
      trigger={
        <button type="button" className={HEADER_LINK}>
          {item.icon && <MenuIcon src={item.icon} />}
          {item.title}
          <ChevronDown aria-hidden className="size-4 text-ink-500" />
        </button>
      }
    />
  )
}

/** The `menu/header` short links of the header's second row. */
export function HeaderLinks({ items, className }: { items: MenuNode[]; className?: string }) {
  const pathname = usePathname() ?? '/'
  if (items.length === 0) return null
  return (
    <ul
      className={cn(
        'flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.id} className="shrink-0">
          {item.children.length > 0 ? (
            <HeaderMenuButton item={item} pathname={pathname} />
          ) : (
            <MenuLink
              node={item}
              withIcon
              aria-current={isActivePath(item.url, pathname) ? 'page' : undefined}
              className={cn(HEADER_LINK, item.url === null && 'cursor-default hover:text-ink-700')}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
