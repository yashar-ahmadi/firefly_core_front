'use client'

import { CountBadge } from '@/components/layout/count-badge'
import { formatNumber } from '@/lib/format'
import { useT } from '@/lib/i18n/i18n-context'
import { useCartCount } from '../hooks'

/**
 * The number of items on a cart icon, in Persian digits and capped at «۹۹+». Place it in a
 * `relative` box. Nothing is rendered by the server or during hydration, or while the cart is
 * empty; it is absolutely placed, so appearing never moves the layout. The count is hidden from
 * assistive tech: name the link with {@link useCartLabel}.
 */
export function CartBadge({ className }: { className?: string }) {
  const count = useCartCount()
  return count > 0 ? <CountBadge count={count} className={className} /> : null
}

/** The cart link's accessible name: «سبد خرید»، or «سبد خرید، ۳ کالا» once items are known. */
export function useCartLabel(): string {
  const t = useT()
  const count = useCartCount()
  return count > 0 ? t('cart_count', { count: formatNumber(count) }) : t('cart')
}
