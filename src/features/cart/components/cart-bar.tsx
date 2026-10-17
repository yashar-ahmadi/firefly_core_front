'use client'

import { useEffect, useId } from 'react'
import { BOTTOM_BAR_FRAME, BOTTOM_BAR_ROW } from '@/components/layout/bottom-bar'
import { cn } from '@/components/ui/cn'
import type { Cart } from '@/lib/api/types/cart'
import { formatToman } from '@/lib/format'
import { CheckoutCta } from './checkout-cta'

/** Mounted bars: the body flag stays while any is on the page. */
let mounted = 0

/**
 * Hides the bottom navigation while the bar is mounted (the product page's buy bar does the
 * same, ruling P2 #20): `body:has([data-cart-bar]) [data-bottom-nav]` (globals.css), and
 * `body[data-cart-bar-shown]` for browsers without `:has()`. The navigation keeps its spacer at
 * the end of the page, so nothing ends up under the bar (they are equally tall).
 */
function useBodyFlag() {
  useEffect(() => {
    mounted += 1
    document.body.setAttribute('data-cart-bar-shown', '')
    return () => {
      mounted -= 1
      if (mounted === 0) document.body.removeAttribute('data-cart-bar-shown')
    }
  }, [])
}

/**
 * The phone's bar on the cart page, fixed to the bottom below md in the bottom navigation's
 * place: the API's `total` and «ادامهٔ خرید». While the checkout is held back, the reason takes
 * the total's label (and describes the button).
 */
export function CartBar({ cart, reason }: { cart: Cart; reason: string | null }) {
  useBodyFlag()
  const reasonId = useId()
  return (
    <section data-cart-bar="" aria-label="نوار سبد خرید" className={cn(BOTTOM_BAR_FRAME, 'z-41')}>
      <div className={cn('flex items-center gap-3 px-4', BOTTOM_BAR_ROW)}>
        <CheckoutCta reason={reason} reasonId={reasonId} size="md" className="min-w-0 flex-1" />
        <div className="flex max-w-[55%] shrink-0 flex-col items-end text-end">
          {reason ? (
            <span id={reasonId} className="line-clamp-1 text-sm leading-6 font-medium text-danger">
              {reason}
            </span>
          ) : (
            <span className="text-sm leading-6 text-ink-600">مبلغ کل</span>
          )}
          <span className="text-base leading-7 font-bold text-ink-900 tabular-nums">
            {formatToman(cart.total)}
          </span>
        </div>
      </div>
    </section>
  )
}
