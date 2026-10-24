'use client'

import { ChevronDown, LayoutGrid } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { useMediaQuery } from '@/components/ui/use-media-query'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { CategoriesDrawer } from './categories-drawer'
import type { MegaMenuOpening, MegaMenuProps } from './mega-menu'
import { CATEGORIES_TRIGGER, MENU_HOVER_DELAY } from './nav-styles'

/** The mega-menu's viewport (Tailwind `lg`); below it the drawer. */
export const MEGA_MENU_QUERY = '(min-width: 64rem)'

/** The mega-menu's code; a failed download rejects (the caller degrades). */
const loadMegaMenu = () => import('./mega-menu').then((module) => module.MegaMenu)

/**
 * The mega-menu's button before its code is in. The menu (its panel holds the whole main menu)
 * is not part of the page: pointing at the button, or focusing it, fetches it; resting the
 * pointer on it (as long as the menu itself waits), a press, or Down/Up mount it open, the focus
 * where the visitor asked for it (`MegaMenuOpening`). Same look as the menu's own button, so the
 * hand-over moves nothing. A failed download sends a press to the categories page.
 */
function MegaMenuStandIn({ items }: { items: MenuNode[] }) {
  const t = useT()
  const [Menu, setMenu] = useState<ComponentType<MegaMenuProps> | null>(null)
  const [opening, setOpening] = useState<MegaMenuOpening | null>(null)
  const hover = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hover.current), [])

  if (Menu && opening) return <Menu items={items} opening={opening} />

  const preload = () => {
    loadMegaMenu().catch(() => {})
  }
  const open = (next: MegaMenuOpening) => {
    window.clearTimeout(hover.current)
    setOpening(next)
    loadMegaMenu()
      .then((component) => setMenu(() => component))
      .catch(() => {
        setOpening(null)
        if (next.focus !== null) loadPage('/categories/')
      })
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      aria-busy={opening ? true : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return
        preload()
        window.clearTimeout(hover.current)
        hover.current = window.setTimeout(() => open({ focus: null }), MENU_HOVER_DELAY)
      }}
      onPointerLeave={() => {
        window.clearTimeout(hover.current)
        // A hover's opening still on its way is dropped: the pointer has gone.
        if (opening?.focus === null) setOpening(null)
      }}
      onFocus={preload}
      onClick={() => open({ focus: 'trigger' })}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        open({ focus: event.key === 'ArrowDown' ? 'first' : 'last' })
      }}
      className={CATEGORIES_TRIGGER}
    >
      <LayoutGrid aria-hidden className="size-5 text-brand-600" />
      {t('categories')}
      <ChevronDown aria-hidden className="size-4 motion-safe:transition-transform" />
    </button>
  )
}

/**
 * «دسته‌بندی‌ها» in the header's second row, per viewport (Plan 5 Task 8): from lg the
 * mega-menu, whose code loads only when the visitor reaches for it (`MegaMenuStandIn`); below lg
 * (tablets) the drawer's button, whose panel loads on the first opening. Phones hide the row, so
 * neither menu's code loads there. The server and hydration render the drawer's button (no
 * viewport yet), which looks the same as the mega-menu's from lg (its chevron shown from lg).
 */
export function CategoriesMenu({ items }: { items: MenuNode[] }) {
  const wide = useMediaQuery(MEGA_MENU_QUERY)
  if (items.length === 0) return null
  return wide ? <MegaMenuStandIn items={items} /> : <CategoriesDrawer items={items} />
}
