import { useEffect, useRef } from 'react'
import type { CartLine } from '@/lib/api/types/cart'

// Where the focus goes once a removed line has left the cart (its bin button went with it):
// shared by the mini-cart and the cart page.

export interface Removal {
  /** The line being removed. */
  variant: number
  /** Its place in the list: the line now there gets the focus. */
  index: number
}

/**
 * The line that took the removed one's place gets the focus (its `[data-line-name]` link; else
 * the new last line's), or `fallback` once the cart is empty. Keyed on the line actually being
 * gone: the cart a write returns may render before the removal's promise settles. Mark a
 * removal in `removal` when its bin is pressed, and clear it when the removal is refused.
 */
export function useFocusAfterRemoval<F extends HTMLElement>(lines: CartLine[] | undefined) {
  const removal = useRef<Removal | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fallbackRef = useRef<F>(null)
  useEffect(() => {
    const removed = removal.current
    if (!removed || !lines || lines.some((line) => line.variant_id === removed.variant)) return
    removal.current = null
    if (lines.length === 0) {
      fallbackRef.current?.focus()
      return
    }
    const names = listRef.current?.querySelectorAll<HTMLElement>('[data-line-name]')
    names?.[Math.min(removed.index, lines.length - 1)]?.focus()
  }, [lines])
  return { removal, listRef, fallbackRef }
}
