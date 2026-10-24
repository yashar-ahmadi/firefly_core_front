'use client'

import { useState } from 'react'
import { CountBadge } from '@/components/layout/count-badge'
import { useHydrated } from '@/components/ui/use-media-query'
import { formatNumber } from '@/lib/format'
import { useT } from '@/lib/i18n/i18n-context'
import { cartCount, useCart, useCartCount } from '../hooks'

/**
 * How often the count has risen since it was first known (0 until then): the page's own first
 * read is no add, the first line in an empty cart is. Kept while rendering, like any state
 * derived from props, so no effect runs for it.
 */
function useRises(count: number | null): number {
  const [last, setLast] = useState(count)
  const [rises, setRises] = useState(0)
  if (count !== last) {
    setLast(count)
    if (last !== null && count !== null && count > last) setRises(rises + 1)
  }
  return rises
}

/**
 * The number of items on a cart icon, in Persian digits and capped at «۹۹+». Place it in a
 * `relative` box. Nothing is rendered by the server or during hydration, or while the cart is
 * empty; it is absolutely placed, so appearing never moves the layout. The count is hidden from
 * assistive tech: name the link with {@link useCartLabel}. When the count rises (an add, spec
 * §7.1) the badge bumps: a new element each time, so its CSS animation plays again
 * (`motion-safe:` only: none for a visitor who asked for less motion).
 */
export function CartBadge({ className }: { className?: string }) {
  const hydrated = useHydrated()
  const { data } = useCart()
  const count = hydrated ? cartCount(data) : 0
  const rises = useRises(hydrated && data ? count : null)
  return count > 0 ? (
    <CountBadge key={rises} count={count} bump={rises > 0} className={className} />
  ) : null
}

/** The cart link's accessible name: «سبد خرید»، or «سبد خرید، ۳ کالا» once items are known. */
export function useCartLabel(): string {
  const t = useT()
  const count = useCartCount()
  return count > 0 ? t('cart_count', { count: formatNumber(count) }) : t('cart')
}
