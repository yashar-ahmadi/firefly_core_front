import { TOP_ZONE } from '@/components/layout/scroll-state'

// Scrolling to a spot of the page just under the sticky header (the product page's section bar,
// a blog post's table of contents). The header shrinks while the page scrolls down and comes back
// while it scrolls up (globals.css: `--header-full`, `--header-compact`).

/** Room between what is above and the target's top once scrolled there. */
const GAP = 8

export interface ScrollTarget {
  /** The target's top in page coordinates. */
  targetTop: number
  currentY: number
  /** The header's height in full and compact (px). */
  full: number
  compact: number
  /** A bar of the page's own under the header (the product's section bar; 0 for none), px. */
  bar: number
}

/**
 * Where to scroll so a target's top sits just under the sticky header (and `bar`). Going down it
 * is the compact header that ends up above it, otherwise (and in the top zone) the full one. Pure.
 */
export function sectionScrollTop({ targetTop, currentY, full, compact, bar }: ScrollTarget) {
  const underCompact = targetTop - compact - bar - GAP
  if (underCompact > currentY && underCompact > TOP_ZONE) return underCompact
  return Math.max(0, targetTop - full - bar - GAP)
}

/** A length custom property of <html> (globals.css) in px; 0 when it is not set. */
export function rootLength(name: string): number {
  const style = getComputedStyle(document.documentElement)
  const raw = style.getPropertyValue(name).trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 0
  return raw.endsWith('rem') ? value * (Number.parseFloat(style.fontSize) || 16) : value
}

/**
 * Scrolls `target` just under the header (at once under reduced motion), moves the focus to it
 * without a second scroll (it must be focusable: `tabindex="-1"`) and puts `hash` in the URL,
 * shareable, without a new history entry. Next's router keeps its own state in
 * `history.state`, so that is passed back untouched.
 */
export function jumpTo(
  target: HTMLElement,
  hash: string,
  { bar = 0, reducedMotion }: { bar?: number; reducedMotion: boolean },
): void {
  const top = sectionScrollTop({
    targetTop: target.getBoundingClientRect().top + window.scrollY,
    currentY: window.scrollY,
    full: rootLength('--header-full'),
    compact: rootLength('--header-compact'),
    bar,
  })
  window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })
  target.focus({ preventScroll: true })
  window.history.replaceState(window.history.state, '', hash)
}
