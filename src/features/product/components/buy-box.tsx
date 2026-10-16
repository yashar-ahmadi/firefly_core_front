'use client'

import { ShoppingCart, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { useAddToCart } from '@/features/cart/hooks'
import { productPath } from '@/features/catalog/listing-routes'
import { compareItemFrom } from '@/features/compare/compare-item'
import { CompareToggle } from '@/features/compare/compare-toggle'
import { HeartButton } from '@/features/wishlist/heart-button'
import { useT } from '@/lib/i18n/i18n-context'
import { unavailableLabel } from '../buy-state'
import { NotifyMe } from './notify-me'
import { PriceBlock } from './price-block'
import { useProduct } from './product-provider'
import { ShareButton } from './share-button'
import { UNAVAILABLE_BUTTON } from './buy-styles'
import { StockStatus } from './stock-status'
import { WholesaleNote } from './wholesale-note'

const BUY_NOW = 'خرید فوری'
const CHECKOUT = '/checkout/'

export interface BuyBoxProps {
  /** The shop's phone (settings), for the wholesale note. */
  contactPhone: string | null
  className?: string
}

/**
 * The buy box: the variant's price and countdown, stock, the quantity within its limits, «add to
 * cart» and «buy now» (add, then checkout), the back-in-stock form when nothing can be bought,
 * the wholesale note, then wishlist, compare and share. Everything follows the variant chosen
 * in the picker, with no request. A missing combination or an out-of-stock variant disables
 * both buttons with the reason (review focus 1).
 */
export function BuyBox({ contactPhone, className }: BuyBoxProps) {
  const t = useT()
  const router = useRouter()
  const { product, variant, quantity, setQuantity, bounds, announcement } = useProduct()
  const { add } = useAddToCart()
  const [running, setRunning] = useState<'add' | 'buy' | null>(null)
  const unavailable = unavailableLabel(product, variant)

  const buy = async (kind: 'add' | 'buy') => {
    if (variant === null || unavailable !== null || running !== null) return
    setRunning(kind)
    const meta = { name: product.name, image: variant.image ?? product.image }
    const added = await add(variant.id, quantity, meta, { toast: kind === 'add' })
    // After buy now succeeds the page is leaving: stay busy, so nothing is added twice.
    if (added && kind === 'buy') router.push(CHECKOUT)
    else setRunning(null)
  }

  const path = `${productPath(product.slug)}${variant ? `?variant=${variant.id}` : ''}`

  return (
    <section
      aria-label="خرید"
      className={cn('flex flex-col gap-4 rounded-card bg-white p-4 shadow-card sm:p-5', className)}
    >
      {/* Says a new choice once made (never on load): price and stock change with no reload. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <PriceBlock variant={variant} />
      <StockStatus variant={variant} productInStock={product.in_stock} />

      {unavailable === null && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-base text-ink-700">تعداد</span>
          <QuantityStepper
            value={quantity}
            min={bounds.min}
            max={bounds.max}
            onChange={setQuantity}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          fullWidth
          disabled={unavailable !== null || running === 'buy'}
          loading={running === 'add'}
          iconStart={unavailable === null ? <ShoppingCart /> : undefined}
          onClick={() => void buy('add')}
          className={cn(unavailable !== null && UNAVAILABLE_BUTTON)}
        >
          {unavailable ?? t('add_to_cart')}
        </Button>
        <Button
          variant="outline"
          fullWidth
          disabled={unavailable !== null || running === 'add'}
          loading={running === 'buy'}
          iconStart={<Zap />}
          onClick={() => void buy('buy')}
        >
          {BUY_NOW}
        </Button>
      </div>

      <NotifyMe />

      {product.enable_major && (
        <WholesaleNote minOrder={variant?.major_min_order_limit ?? null} phone={contactPhone} />
      )}

      <div className="flex items-center justify-center gap-2 border-t border-ink-100 pt-3">
        <HeartButton productId={product.id} slug={product.slug} size="md" />
        <CompareToggle item={compareItemFrom(product)} size="md" />
        <ShareButton title={product.name} path={path} />
      </div>
    </section>
  )
}
