'use client'

import { ChevronDown, LayoutGrid } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Direction } from 'radix-ui'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { useT } from '@/lib/i18n/i18n-context'
import { isListing } from './mega-menu-content'
import { firstLink, MegaMenuPanel, nextContentFocus, type StartItemProps } from './mega-menu-panel'
import { navItems, type CategoryLinkNode } from './menu-tree'
import { CATEGORIES_TRIGGER } from './nav-styles'

/** Hover intent: the pointer must rest this long before the menu opens or switches item. */
const HOVER_DELAY = 120
/** Grace period for a pointer that briefly leaves the menu. */
const CLOSE_DELAY = 200
/** Scrolling the page further than this closes the menu (the header compacts too). */
const SCROLL_CLOSE = 8

type TimerName = 'open' | 'close' | 'item'

export interface MegaMenuProps {
  /** `menu/main`; while it is empty the category tree is shown instead. */
  menu: MenuNode[]
  categories: readonly CategoryLinkNode[]
  className?: string
}

/**
 * The desktop «دسته‌بندی‌ها» mega-menu. It opens on hover (after 120 ms), on click and from the
 * keyboard, and closes on Escape, an outside click, the pointer or focus leaving it, scrolling
 * and a route change. Arrow Up/Down move through the start column, the forward arrow (Left in
 * RTL) moves into the columns and between them, Enter follows a link and Tab moves naturally.
 * Rendered from lg up; it must sit in a `relative` full-width bar (the panel spans it).
 */
export function MegaMenu({ menu, categories, className }: MegaMenuProps) {
  const t = useT()
  const forward = Direction.useDirection() === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const items = useMemo(() => navItems(menu, categories), [menu, categories])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pointerType = useRef('mouse')
  const timers = useRef<Partial<Record<TimerName, number>>>({})
  const panelId = `${useId()}-panel`

  // A new route closes the menu (state adjusted while rendering, so no extra pass).
  const pathname = usePathname()
  const [shownPath, setShownPath] = useState(pathname)
  if (shownPath !== pathname) {
    setShownPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    if (!open) return
    const startY = window.scrollY
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const hadFocus = rootRef.current?.contains(document.activeElement)
      setOpen(false)
      if (hadFocus) triggerRef.current?.focus()
    }
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > SCROLL_CLOSE) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  if (items.length === 0) return null

  const clearTimer = (name: TimerName) => window.clearTimeout(timers.current[name])
  const later = (name: TimerName, run: () => void, delay: number) => {
    clearTimer(name)
    timers.current[name] = window.setTimeout(run, delay)
  }
  const show = () => {
    clearTimer('open')
    clearTimer('close')
    if (!open) setActive(0)
    setOpen(true)
  }
  const hide = () => {
    for (const name of ['open', 'close', 'item'] as const) clearTimer(name)
    const hadFocus = rootRef.current?.contains(document.activeElement)
    setOpen(false)
    if (hadFocus) triggerRef.current?.focus()
  }

  const itemElement = (index: number) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-mega-item="${index}"]`) ?? undefined
  const openAt = (index: number) => {
    flushSync(() => {
      setOpen(true)
      setActive(index)
    })
    itemElement(index)?.focus()
  }

  const onItemKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const last = items.length - 1
    const moves: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }
    const intoColumns =
      event.key === forward ||
      (items[index].url === null && (event.key === 'Enter' || event.key === ' '))
    if (event.key in moves) itemElement(moves[event.key])?.focus()
    else if (intoColumns) {
      firstLink(rootRef.current?.querySelector(`[data-mega-content="${index}"]`))?.focus()
    } else return
    event.preventDefault()
  }

  const itemProps = (index: number): StartItemProps => ({
    'data-mega-item': index,
    tabIndex: index === active ? 0 : -1,
    onFocus: () => setActive(index),
    onPointerEnter: (event) => {
      if (event.pointerType === 'mouse' && index !== active) {
        later('item', () => setActive(index), HOVER_DELAY)
      }
    },
    onPointerLeave: () => clearTimer('item'),
    onKeyDown: (event) => onItemKeyDown(event, index),
  })

  return (
    <div
      ref={rootRef}
      className={cn('flex', className)}
      onPointerDownCapture={(event) => {
        pointerType.current = event.pointerType
      }}
      onPointerEnter={() => clearTimer('close')}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return
        clearTimer('open')
        if (open) later('close', hide, CLOSE_DELAY)
      }}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (open && next instanceof Node && !rootRef.current?.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && !open) later('open', show, HOVER_DELAY)
        }}
        onClick={(event) => {
          // A mouse click only opens (hovering may have opened it already); keys and touch toggle.
          if (event.detail > 0 && pointerType.current === 'mouse') show()
          else if (open) hide()
          else show()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openAt(event.key === 'ArrowDown' ? 0 : items.length - 1)
        }}
        className={CATEGORIES_TRIGGER}
      >
        <LayoutGrid aria-hidden className="size-5 text-brand-600" />
        {t('categories')}
        <ChevronDown
          aria-hidden
          className={cn('size-4 motion-safe:transition-transform', open && 'rotate-180')}
        />
      </button>
      <MegaMenuPanel
        id={panelId}
        open={open}
        items={items}
        active={active}
        listLabel={t('categories')}
        allLabel={(node) =>
          t(isListing(node) ? 'menu_all_products' : 'menu_view', { name: node.title })
        }
        itemProps={itemProps}
        onItemClick={(event, index) => {
          // On touch, the first tap on an item with children only shows them.
          if (pointerType.current !== 'mouse' && index !== active && items[index].children.length) {
            event.preventDefault()
            setActive(index)
          }
        }}
        onContentKeyDown={(event) => {
          const next = nextContentFocus(
            event.currentTarget,
            event.key,
            forward,
            itemElement(active),
          )
          if (next === undefined) return
          event.preventDefault()
          next?.focus()
        }}
        onContentEnter={() => clearTimer('item')}
        onPanelEnter={() => clearTimer('close')}
        onBackdropEnter={(event) => {
          if (event.pointerType === 'mouse') later('close', hide, CLOSE_DELAY)
        }}
        onClose={hide}
      />
    </div>
  )
}
