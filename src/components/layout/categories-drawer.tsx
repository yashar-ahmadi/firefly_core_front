'use client'

import { LayoutGrid } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/components/ui/cn'
import { Drawer } from '@/components/ui/drawer'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { isListing } from './mega-menu-content'
import { MenuIcon, MenuLink } from './menu-link'
import { CATEGORIES_TRIGGER } from './nav-styles'

function rowClasses(depth: number) {
  return cn(
    'flex items-center gap-3 transition-colors hover:text-brand-800 focus-visible:-outline-offset-2',
    depth === 0
      ? 'min-h-14 border-b border-ink-200 text-base font-medium text-ink-900 last:border-b-0'
      : 'min-h-11 text-base text-ink-700',
  )
}

/** The menu as an accordion: items with children open in place, leaves are links. */
function DrawerTree({
  nodes,
  onNavigate,
  depth = 0,
}: {
  nodes: MenuNode[]
  onNavigate: () => void
  depth?: number
}) {
  const t = useT()
  return (
    <Accordion type="multiple" className={cn(depth > 0 && 'ms-1 border-s border-ink-100 ps-4')}>
      {nodes.map((node) =>
        node.children.length > 0 ? (
          <AccordionItem
            key={node.id}
            value={String(node.id)}
            className={cn(depth > 0 && 'border-b-0')}
          >
            <AccordionTrigger
              className={cn(depth > 0 && 'min-h-11 py-1.5 font-normal text-ink-700')}
            >
              <span className="flex items-center gap-3">
                {node.icon && <MenuIcon src={node.icon} />}
                {node.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              {node.url !== null && (
                <MenuLink
                  node={node}
                  onNavigate={onNavigate}
                  className={cn(rowClasses(depth + 1), 'font-medium text-brand-700')}
                >
                  {t(isListing(node) ? 'menu_all_products' : 'menu_view', { name: node.title })}
                </MenuLink>
              )}
              <DrawerTree nodes={node.children} onNavigate={onNavigate} depth={depth + 1} />
            </AccordionContent>
          </AccordionItem>
        ) : (
          <MenuLink
            key={node.id}
            node={node}
            withIcon
            onNavigate={onNavigate}
            className={rowClasses(depth)}
          />
        ),
      )}
    </Accordion>
  )
}

/**
 * The «دسته‌بندی‌ها» entry on tablets (md to lg): a drawer from the start side with the main menu
 * (or the category tree while it is empty, see `navItems`) as an accordion. Closes on navigation.
 */
export function CategoriesDrawer({ items, className }: { items: MenuNode[]; className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [shownPath, setShownPath] = useState(pathname)
  if (shownPath !== pathname) {
    setShownPath(pathname)
    setOpen(false)
  }
  if (items.length === 0) return null

  return (
    <div className={className}>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="start"
        title={t('categories')}
        trigger={
          <button type="button" className={CATEGORIES_TRIGGER}>
            <LayoutGrid aria-hidden className="size-5 text-brand-600" />
            {t('categories')}
          </button>
        }
      >
        <DrawerTree nodes={items} onNavigate={() => setOpen(false)} />
      </Drawer>
    </div>
  )
}
