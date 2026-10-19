'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { jumpTo } from '@/components/layout/in-page-scroll'
import { cn } from '@/components/ui/cn'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import { formatNumber } from '@/lib/format'
import { isModifiedClick } from '@/lib/navigation/modified-click'

export interface SectionLink {
  /** The section element's id, the link's `#hash`. */
  id: string
  label: string
  /** Shown beside the label when above zero (reviews, questions). */
  count?: number
}

const LABEL = 'بخش\u{200C}های صفحه\u{0654} محصول'
/** The band of the viewport where a section counts as the one being read. */
const READING_BAND = '-35% 0px -60% 0px'

/** What a hand scroll starts with; a programmatic scroll fires none of these. */
const HAND_SCROLL = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * The section in the reading band, the first one when two are; between sections the last one
 * stays. Above the first section (the top of the page) none is. `pin(id)` marks a section the
 * bar scrolls to and holds it while that scroll passes other sections, and when a short last
 * section never reaches the band, until the visitor scrolls by hand. Without
 * IntersectionObserver only the pressed tab is marked.
 */
function useActiveSection(ids: readonly string[]): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null)
  const pinned = useRef(false)
  const key = ids.join(' ')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const order = key.split(' ')
    const inBand = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id)
          else inBand.delete(entry.target.id)
        }
        if (pinned.current) return
        const first = order.find((id) => inBand.has(id))
        if (first) return setActive(first)
        // The first section left the band downwards: the visitor went back above the sections.
        const top = entries.find((entry) => entry.target.id === order[0] && !entry.isIntersecting)
        const below = top?.boundingClientRect?.top ?? -Infinity
        if (below >= (top?.rootBounds?.bottom ?? Infinity)) setActive(null)
      },
      { rootMargin: READING_BAND },
    )
    for (const id of order) {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    }
    return () => observer.disconnect()
  }, [key])

  useEffect(() => {
    const release = () => {
      pinned.current = false
    }
    for (const type of HAND_SCROLL) {
      window.addEventListener(type, release, { capture: true, passive: true })
    }
    return () => {
      for (const type of HAND_SCROLL) window.removeEventListener(type, release, { capture: true })
    }
  }, [])

  const pin = useCallback((id: string) => {
    pinned.current = true
    setActive(id)
  }, [])
  return [active, pin]
}

/**
 * The product page's in-page tab bar: anchor links to its sections, sticky under the header,
 * scrolling sideways when the links do not fit. A press scrolls the section just under the
 * header and the bar (at once under reduced motion), moves the focus there and puts its `#id`
 * in the URL; the section being read is marked (`aria-current`). Without script the links still
 * jump (the sections have a scroll margin).
 */
export function ProductSectionsNav({ items }: { items: readonly SectionLink[] }) {
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [active, pin] = useActiveSection(items.map((item) => item.id))

  // Keep the marked link in view on phones, where the bar scrolls sideways.
  useEffect(() => {
    const list = listRef.current
    const link = active ? list?.querySelector(`a[href="#${active}"]`) : null
    if (!list || !link || typeof list.scrollBy !== 'function') return
    const box = list.getBoundingClientRect()
    const { left, right } = link.getBoundingClientRect()
    const delta =
      left < box.left ? left - box.left - 16 : right > box.right ? right - box.right + 16 : 0
    if (delta !== 0) list.scrollBy({ left: delta, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [active, reducedMotion])

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isModifiedClick(event)) return
    const section = document.getElementById(id)
    if (!section) return
    event.preventDefault()
    jumpTo(section, `#${id}`, { bar: navRef.current?.offsetHeight ?? 0, reducedMotion })
    pin(id)
  }

  return (
    <nav
      ref={navRef}
      aria-label={LABEL}
      className="sticky top-(--header-offset) z-30 -mx-4 border-b border-ink-200 bg-white shadow-sm transition-[top] duration-200 ease-out lg:-mx-6"
    >
      <ul
        ref={listRef}
        className="flex [scrollbar-width:none] overflow-x-auto px-1.5 md:px-2 lg:px-4 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'true' : undefined}
              onClick={(event) => go(event, item.id)}
              className={cn(
                'relative flex min-h-12 items-center gap-1.5 px-2.5 text-base font-medium whitespace-nowrap text-ink-700 transition-colors hover:text-ink-900 sm:px-3 md:px-4',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-transparent',
                'aria-[current=true]:text-brand-700 aria-[current=true]:after:bg-brand',
                'focus-visible:-outline-offset-2',
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="min-w-6 rounded-pill bg-ink-100 px-1.5 text-center text-sm leading-6 text-ink-700">
                  {formatNumber(item.count)}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
