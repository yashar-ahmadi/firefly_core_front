'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import { cn } from '@/components/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { MenuIcon, MenuLink } from './menu-link'
import { isActivePath } from './menu-tree'
import { HEADER_LINK } from './nav-styles'

/** Every descendant with its depth, in menu order: the dropdown lists them flat, indented. */
function flatten(nodes: MenuNode[], depth = 0): { node: MenuNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)])
}

/** A header item with children: a menu of them (headings as labels, links as items). */
function HeaderDropdown({ item, pathname }: { item: MenuNode; pathname: string }) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={HEADER_LINK}>
        {item.icon && <MenuIcon src={item.icon} />}
        {item.title}
        <ChevronDown aria-hidden className="size-4 text-ink-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {item.url !== null && (
          <DropdownMenuItem asChild>
            <MenuLink node={item} className="font-medium text-brand-700">
              {t('menu_view', { name: item.title })}
            </MenuLink>
          </DropdownMenuItem>
        )}
        {flatten(item.children).map(({ node, depth }) => (
          <Fragment key={node.id}>
            {node.url === null ? (
              <DropdownMenuLabel style={{ paddingInlineStart: `${0.75 + depth}rem` }}>
                {node.title}
              </DropdownMenuLabel>
            ) : (
              <DropdownMenuItem asChild>
                <MenuLink
                  node={node}
                  withIcon
                  aria-current={isActivePath(node.url, pathname) ? 'page' : undefined}
                  style={{ paddingInlineStart: `${0.75 + depth}rem` }}
                />
              </DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
            <HeaderDropdown item={item} pathname={pathname} />
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
