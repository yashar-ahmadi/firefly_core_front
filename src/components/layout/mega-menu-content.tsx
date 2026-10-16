'use client'

import { ChevronLeft } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { MenuLink } from './menu-link'

// What the mega-menu shows for one top-level item: a link to the item itself, then its children
// as columns (second level as bold headings, third level as links under them).

/** Targets that are product listings: their "all" link reads «همهٔ محصولات …». */
const LISTINGS = new Set<MenuNode['link_type']>(['product_category', 'brand', 'product_list'])

export function isListing(node: MenuNode): boolean {
  return LISTINGS.has(node.link_type)
}

const SUB_LINK = cn(
  'flex min-h-10 items-center gap-2 rounded-control py-1.5 text-sm text-ink-600',
  'transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
)

function SubLinks({
  nodes,
  onNavigate,
  nested = false,
}: {
  nodes: MenuNode[]
  onNavigate: () => void
  nested?: boolean
}) {
  return (
    <ul className={cn(nested ? 'ms-3 border-s border-ink-100 ps-3' : 'mt-1')}>
      {nodes.map((node) => (
        <li key={node.id}>
          <MenuLink
            node={node}
            withIcon
            prefetch={false}
            onNavigate={onNavigate}
            className={cn(SUB_LINK, node.url === null && 'font-medium text-ink-800')}
          />
          {node.children.length > 0 && (
            <SubLinks nodes={node.children} onNavigate={onNavigate} nested />
          )}
        </li>
      ))}
    </ul>
  )
}

export interface MegaMenuContentProps {
  node: MenuNode
  /** The label of the link to the item itself, e.g. «همهٔ محصولات کالای دیجیتال». */
  allLabel: string
  onNavigate: () => void
}

export function MegaMenuContent({ node, allLabel, onNavigate }: MegaMenuContentProps) {
  return (
    <>
      <div className="mb-5 flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-ink-100 pb-3">
        <p className="text-lg leading-8 font-bold text-ink-900">{node.title}</p>
        {node.url !== null && (
          <MenuLink
            node={node}
            prefetch={false}
            onNavigate={onNavigate}
            className="inline-flex min-h-10 items-center gap-1 rounded-control text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline hover:underline-offset-4"
          >
            {allLabel}
            <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
          </MenuLink>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="columns-3 gap-x-8 xl:columns-4">
          {node.children.map((child) => (
            <div key={child.id} data-mega-column="" className="mb-6 break-inside-avoid">
              <MenuLink
                node={child}
                withIcon
                prefetch={false}
                onNavigate={onNavigate}
                className={cn(
                  'flex min-h-10 items-center gap-2 border-s-2 border-brand ps-2.5 text-base font-bold text-ink-900',
                  child.url !== null && 'transition-colors hover:text-brand-700',
                  'focus-visible:-outline-offset-2',
                )}
              />
              {child.children.length > 0 && (
                <SubLinks nodes={child.children} onNavigate={onNavigate} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
