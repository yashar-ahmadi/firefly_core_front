'use client'

import { BOTTOM_BAR_FRAME, BOTTOM_BAR_ROW } from '@/components/layout/bottom-bar'
import { BellRing } from 'lucide-react'
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

/**
 * The phone's buy bar, fixed to the bottom below md where the bottom navigation would be (the
 * navigation steps aside on product pages and keeps this bar's room at the end of the page):
 * the variant's price and «add to cart» with the quantity chosen in the buy box. When nothing
 * of the product can be bought, it leads to the back-in-stock form instead (when that is on).
 */
export function StickyBuyBar() {
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
    <section aria-label="نوار خرید" className={BOTTOM_BAR_FRAME}>
      <div className={cn('flex items-center gap-3 px-4', BOTTOM_BAR_ROW)}>
        {action}
        <PriceBlock variant={variant} size="sm" countdown={false} className="shrink-0" />
      </div>
    </section>
  )
}
