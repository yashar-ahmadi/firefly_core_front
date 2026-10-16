'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { Rating } from '@/components/ui/rating'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import { productPath } from '@/features/catalog/listing-routes'
import { unavailableLabel } from '@/features/product/buy-state'
import { UNAVAILABLE_BUTTON } from '@/features/product/components/buy-styles'
import { PriceBlock } from '@/features/product/components/price-block'
import { ProductGallery } from '@/features/product/components/product-gallery'
import { useProduct } from '@/features/product/components/product-provider'
import { StockStatus } from '@/features/product/components/stock-status'
import { VariantPicker } from '@/features/product/components/variant-picker'
import { WholesaleNote } from '@/features/product/components/wholesale-note'
import { productKey } from '@/features/product/product-query'

const DETAILS = 'مشاهده\u{0654} جزئیات کامل'

export interface QuickViewDetailsProps {
  /** The cart has the product: quick view closes (the «added» toast confirms it). */
  onAdded: () => void
  /** The details link was followed: quick view closes as the page changes. */
  onLeave: () => void
}

/**
 * Inside quick view, on the product's ProductProvider: the swipeable gallery, the rating, the
 * variant picker, the price and stock of the chosen variant, a link to the full page on that
 * variant, and the quantity with «add to cart» pinned at the bottom of the panel. Choices are
 * announced like on the product page.
 *
 * After a successful add the panel closes (the parent's `onAdded`), always: the toast says what
 * was added, the badge counts it and the focus goes back to the card that opened it.
 */
export function QuickViewDetails({ onAdded, onLeave }: QuickViewDetailsProps) {
  const client = useQueryClient()
  const { product, variant, quantity, setQuantity, bounds, announcement } = useProduct()
  const unavailable = unavailableLabel(product, variant)
  const details = `${productPath(product.slug)}${variant ? `?variant=${variant.id}` : ''}`
  const readAgain = () => void client.invalidateQueries({ queryKey: productKey(product.slug) })

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-x-6">
      {/* Swiping the pictures must not drag the sheet. */}
      <div data-vaul-no-drag="" className="mx-auto w-full max-w-56 md:max-w-none">
        <ProductGallery compact />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <div className="flex min-h-6 items-center text-base text-ink-700">
          {product.rating > 0 ? (
            <Rating value={product.rating} count={product.rating_count} size="sm" />
          ) : (
            <span>بدون امتیاز</span>
          )}
        </div>
        <VariantPicker />
        <PriceBlock variant={variant} size="md" onDealEnd={readAgain} />
        <StockStatus variant={variant} productInStock={product.in_stock} />
        {product.enable_major && (
          <WholesaleNote minOrder={variant?.major_min_order_limit ?? null} phone={null} />
        )}
        <Link
          href={details}
          prefetch={false}
          onClick={onLeave}
          className={cn(buttonClasses({ variant: 'link' }), 'self-start')}
        >
          {DETAILS}
          <ChevronLeft aria-hidden className="ltr:rotate-180" />
        </Link>
      </div>

      {/* Pinned at the bottom edge of the scrolling panel, across both columns: the negative
          offset and margin cancel the panel's bottom padding (Chrome sticks inside it). From md
          the controls sit at the end, under the details. */}
      <div className="sticky -bottom-4 z-[1] -mx-4 -mb-4 flex items-center gap-3 border-t border-ink-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 md:-bottom-6 md:col-span-2 md:-mb-6 md:justify-end md:rounded-b-card md:pb-3">
        {unavailable === null && variant !== null ? (
          <>
            <QuantityStepper
              value={quantity}
              min={bounds.min}
              max={bounds.max}
              onChange={setQuantity}
            />
            <AddToCartButton
              variantId={variant.id}
              quantity={quantity}
              product={{ name: product.name, image: variant.image ?? product.image }}
              onAdded={onAdded}
              className="min-w-0 flex-1 md:w-72 md:flex-none"
            />
          </>
        ) : (
          <Button disabled className={cn('w-full md:w-72', UNAVAILABLE_BUTTON)}>
            {unavailable}
          </Button>
        )}
      </div>
    </div>
  )
}
