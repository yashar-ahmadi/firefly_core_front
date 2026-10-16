'use client'

import { Fragment } from 'react'
import { useFirstItemFocus, type DeferredMenuProps } from '@/components/ui/deferred-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { MenuLink } from './menu-link'
import { isActivePath } from './menu-tree'

/** Every descendant with its depth, in menu order: the dropdown lists them flat, indented. */
function flatten(nodes: MenuNode[], depth = 0): { node: MenuNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)])
}

export interface HeaderDropdownProps {
  item: MenuNode
  pathname: string
}

/**
 * A header item with children: a menu of them (headings as labels, links as items). Loaded on
 * first use by `HeaderLinks` (see DeferredMenu), so it starts open.
 */
export function HeaderDropdown({
  item,
  pathname,
  trigger,
  opening,
}: HeaderDropdownProps & DeferredMenuProps) {
  const t = useT()
  const firstItemFocus = useFirstItemFocus(opening)
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent {...firstItemFocus} align="start">
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
