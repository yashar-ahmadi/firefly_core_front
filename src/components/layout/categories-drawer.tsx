'use client'

import { ChevronDown, LayoutGrid } from 'lucide-react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PanelPending } from '@/components/ui/panel-pending'
import { trackPresses } from '@/components/ui/press-tracking'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { loadPage } from '@/lib/navigation/hard-navigation'
import type { CategoriesDrawerPanelProps } from './categories-drawer-panel'
import { CATEGORIES_TRIGGER } from './nav-styles'

/** Stands in for the drawer when its code could not be downloaded: the categories page. */
function DrawerUnavailable() {
  useEffect(() => loadPage('/categories/'), [])
  return null
}

// The drawer (Radix Dialog and the accordion) loads on the first opening, or earlier when the
// button is hovered, focused or pressed. A failed download resolves to DrawerUnavailable.
const CategoriesDrawerPanel = dynamic<CategoriesDrawerPanelProps>(
  () =>
    import('./categories-drawer-panel')
      .then((module) => module.CategoriesDrawerPanel)
      .catch(() => DrawerUnavailable),
  { ssr: false, loading: () => <PanelPending label="در حال بارگذاری دسته‌بندی‌ها" /> },
)
/** A failed preload is dropped: the first opening imports the code itself. */
const preloadPanel = () => {
  import('./categories-drawer-panel').catch(() => {})
}

/**
 * The «دسته‌بندی‌ها» entry on tablets (md to lg): a drawer from the start side with the main menu
 * (or the category tree while it is empty, see `navItems`) as an accordion. Closes on navigation.
 * The drawer's code loads on the first opening; this button is all the page carries.
 */
export function CategoriesDrawer({ items, className }: { items: MenuNode[]; className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const pathname = usePathname()
  const [shownPath, setShownPath] = useState(pathname)
  if (shownPath !== pathname) {
    setShownPath(pathname)
    setOpen(false)
  }
  // The drawer returns the focus to its opener: record presses before its code is loaded.
  useEffect(trackPresses, [])
  if (items.length === 0) return null

  return (
    <div className={className}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={preloadPanel}
        onFocus={preloadPanel}
        onPointerDown={preloadPanel}
        onClick={() => {
          setRequested(true)
          setOpen(true)
        }}
        className={CATEGORIES_TRIGGER}
      >
        <LayoutGrid aria-hidden className="size-5 text-brand-600" />
        {t('categories')}
        {/* The server renders this button at every width (categories-menu.tsx): from lg it
            stands for the mega-menu's, chevron included, until the viewport is known. */}
        <ChevronDown aria-hidden className="hidden size-4 lg:block" />
      </button>
      {requested && <CategoriesDrawerPanel items={items} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
