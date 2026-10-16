'use client'

import { BOTTOM_BAR_FRAME, BOTTOM_BAR_ROW } from '@/components/layout/bottom-bar'
import { BellRing } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import { useFeature } from '@/features/settings/feature-context'
import { unavailableLabel } from '../buy-state'
import { UNAVAILABLE_BUTTON } from './buy-styles'
import { NOTIFY_ME_ID, NOTIFY_ME_TITLE } from './notify-me'
import { PriceBlock } from './price-block'
import { useProduct } from './product-provider'

/** Mounted bars: the body flag stays while any is on the page. */
let mounted = 0

/**
 * Hides the bottom navigation while the bar is mounted, from the first paint and never by URL
 * (a missing product's 404 page keeps the navigation):
 * - `data-sticky-buy-bar` is in the server HTML, and `body:has([data-sticky-buy-bar])
 *   [data-bottom-nav]` (globals.css) hides the navigation before any script runs;
 * - browsers without `:has()` get `body[data-buy-bar-shown]` once this mounts; until then the
 *   bar sits one layer above the navigation and covers it (they are equally tall).
 * The navigation keeps its spacer, so the bar's room stays at the end of the page.
 */
function useBodyFlag() {
  useEffect(() => {
    mounted += 1
    document.body.setAttribute('data-buy-bar-shown', '')
    return () => {
      mounted -= 1
      if (mounted === 0) document.body.removeAttribute('data-buy-bar-shown')
    }
  }, [])
}

/**
 * The phone's buy bar, fixed to the bottom below md in place of the bottom navigation: the
 * variant's price and «add to cart» with the quantity chosen in the buy box. When nothing of the
 * product can be bought, it leads to the back-in-stock form instead (when that is on).
 */
export function StickyBuyBar() {
  useBodyFlag()
  const { product, variant, quantity } = useProduct()
  const notifications = useFeature('stock_notifications')
  const unavailable = unavailableLabel(product, variant)
  const action =
    unavailable === null && variant !== null ? (
      <AddToCartButton
        variantId={variant.id}
        quantity={quantity}
        product={{ name: product.name, image: variant.image ?? product.image }}
        className="min-w-0 flex-1"
      />
    ) : !product.in_stock && notifications.enabled ? (
      <a
        href={`#${NOTIFY_ME_ID}`}
        className={cn(buttonClasses({ variant: 'secondary' }), 'min-w-0 flex-1')}
      >
        <BellRing aria-hidden />
        {NOTIFY_ME_TITLE}
      </a>
    ) : (
      <Button disabled className={cn('min-w-0 flex-1', UNAVAILABLE_BUTTON)}>
        {unavailable}
      </Button>
    )
  return (
    <section data-sticky-buy-bar="" aria-label="نوار خرید" className={cn(BOTTOM_BAR_FRAME, 'z-41')}>
      <div className={cn('flex items-center gap-3 px-4', BOTTOM_BAR_ROW)}>
        {action}
        <PriceBlock variant={variant} size="sm" countdown={false} className="shrink-0" />
      </div>
    </section>
  )
}
