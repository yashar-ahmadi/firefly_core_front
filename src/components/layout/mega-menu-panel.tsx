'use client'

import { ChevronLeft } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { CONTAINER } from './container'
import { MegaMenuContent } from './mega-menu-content'
import { MenuIcon, MenuLink } from './menu-link'

// The mega-menu's panel: a dimmed backdrop, the start column of top-level items and the active
// item's columns. State and timing live in mega-menu.tsx.

export const firstLink = (scope: Element | null | undefined) =>
  scope?.querySelector<HTMLElement>('a[href]') ?? undefined

/**
 * Where an arrow key moves from a link in an item's columns: Up/Down through the links in
 * order, forward/back to the first link of the next/previous column, and out to the start
 * column (`startItem`) from the first column or the first link. `undefined`: not handled.
 *
 * A "column" here is a second-level group (`[data-mega-column]`), not a visual CSS column: the
 * groups flow through `columns-3`/`columns-4`, so the next group may sit below the current one
 * in the same visual column, and forward/back then moves focus down or up rather than sideways.
 */
export function nextContentFocus(
  scope: HTMLElement,
  key: string,
  forward: string,
  startItem: HTMLElement | undefined,
): HTMLElement | null | undefined {
  const focused = document.activeElement as HTMLElement | null
  const links = [...scope.querySelectorAll<HTMLElement>('a[href]')]
  const current = focused ? links.indexOf(focused) : -1
  if (current < 0) return undefined
  const columns = [...scope.querySelectorAll<HTMLElement>('[data-mega-column]')]
  const column = focused?.closest<HTMLElement>('[data-mega-column]')
  // -1: the link to the item itself, above the columns.
  const columnIndex = column ? columns.indexOf(column) : -1
  const columnLink = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < columns.length; i += step) {
      const link = firstLink(columns[i])
      if (link) return link
    }
    return undefined
  }
  const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'
  if (key === 'ArrowDown') return links[current + 1] ?? null
  if (key === 'ArrowUp') return current > 0 ? links[current - 1] : startItem
  if (key === forward) return columnLink(columnIndex + 1, 1) ?? null
  if (key === back)
    return (columnIndex > 0 ? columnLink(columnIndex - 1, -1) : undefined) ?? startItem
  return undefined
}

/** Props every start-column item gets, link or button. */
export interface StartItemProps {
  'data-mega-item': number
  tabIndex: number
  onFocus: () => void
  onPointerEnter: (event: PointerEvent) => void
  onPointerLeave: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface MegaMenuPanelProps {
  id: string
  open: boolean
  items: MenuNode[]
  active: number
  /** Names the start column («دسته‌بندی‌ها»). */
  listLabel: string
  allLabel: (node: MenuNode) => string
  itemProps: (index: number) => StartItemProps
  /** A click on a start-column link (may cancel it to only show the children). */
  onItemClick: (event: MouseEvent<HTMLElement>, index: number) => void
  onContentKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** The pointer reached the columns: a pending item switch is cancelled. */
  onContentEnter: () => void
  /** The pointer is back on the panel: a pending close is cancelled. */
  onPanelEnter: () => void
  /** The pointer moved onto the dimmed page: like leaving the menu. */
  onBackdropEnter: (event: PointerEvent) => void
  onClose: () => void
}

const ITEM = cn(
  'relative flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 text-start text-base text-ink-700',
  'transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
)
const ITEM_ACTIVE = cn(
  'bg-white font-medium text-brand-700',
  'before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-e-full before:bg-brand',
)

export function MegaMenuPanel({
  id,
  open,
  items,
  active,
  listLabel,
  allLabel,
  itemProps,
  onItemClick,
  onContentKeyDown,
  onContentEnter,
  onPanelEnter,
  onBackdropEnter,
  onClose,
}: MegaMenuPanelProps) {
  const anyIcon = items.some((item) => item.icon)
  return (
    <div
      id={id}
      hidden={!open}
      className="absolute inset-x-0 top-full z-30 motion-safe:animate-fade-in"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-dvh bg-ink-950/25"
        onClick={onClose}
        onPointerEnter={onBackdropEnter}
      />
      <div className={cn(CONTAINER, 'relative')} onPointerEnter={onPanelEnter}>
        <div className="flex max-h-[min(36rem,calc(100dvh-var(--header-offset)-2rem))] min-h-72 overflow-hidden rounded-b-card border border-t-0 border-ink-200 bg-white shadow-raised">
          <ul
            aria-label={listLabel}
            className="w-60 shrink-0 overflow-y-auto overscroll-contain border-e border-ink-100 bg-ink-50 py-2 xl:w-64"
          >
            {items.map((item, index) => {
              const props = {
                ...itemProps(index),
                className: cn(ITEM, index === active && ITEM_ACTIVE),
              }
              const label = (
                <>
                  {anyIcon &&
                    (item.icon ? <MenuIcon src={item.icon} /> : <span className="size-5" />)}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.children.length > 0 && (
                    <ChevronLeft aria-hidden className="size-4 shrink-0 ltr:rotate-180" />
                  )}
                </>
              )
              return (
                <li key={item.id}>
                  {item.url === null ? (
                    <button type="button" {...props}>
                      {label}
                    </button>
                  ) : (
                    <MenuLink
                      node={item}
                      prefetch={false}
                      onNavigate={onClose}
                      onClick={(event) => onItemClick(event, index)}
                      // A first tap may only open the children: the click is no page change.
                      data-opens-dialog={item.children.length > 0 ? '' : undefined}
                      {...props}
                    >
                      {label}
                    </MenuLink>
                  )}
                </li>
              )
            })}
          </ul>
          <div
            className="grid min-w-0 flex-1 overflow-y-auto overscroll-contain"
            onPointerEnter={onContentEnter}
          >
            {/* Every item's content shares one grid cell: the panel keeps the tallest height. */}
            {items.map((item, index) => (
              <div
                key={item.id}
                data-mega-content={index}
                aria-hidden={index !== active || undefined}
                inert={index !== active}
                onKeyDown={onContentKeyDown}
                className={cn('col-start-1 row-start-1 p-6', index !== active && 'invisible')}
              >
                <MegaMenuContent node={item} allLabel={allLabel(item)} onNavigate={onClose} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
