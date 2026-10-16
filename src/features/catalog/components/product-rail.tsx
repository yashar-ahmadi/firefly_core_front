import { ListFilter } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Carousel, type SlidesPerView } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import type { CardProduct } from '@/features/catalog/card-product'
import { ProductCard } from './product-card'

/** Two and a bit cards on phones, three and a half on tablets, five from lg. */
const PER_VIEW: SlidesPerView = { base: 2.2, md: 3.5, lg: 5 }

/**
 * The card's action row. A simple product with a variant adds in one tap. A variable one shows
 * a «choose options» label drawn as a button but inert: a click passes through to the card's
 * link, where the variant is chosen (quick view replaces it in Plan 2 Task 9). It keeps every
 * card in a rail the same height, so the prices line up.
 */
function cardAction(product: CardProduct) {
  if (product.type !== 'variable' && product.default_variant_id !== null) {
    return (
      <AddToCartButton
        variantId={product.in_stock ? product.default_variant_id : null}
        quantity={product.order_limit_min || 1}
        product={{ name: product.name, image: product.image }}
        size="sm"
        variant="secondary"
        fullWidth
        label="افزودن به سبد"
      />
    )
  }
  if (product.type !== 'variable') return undefined
  return (
    <span
      aria-hidden
      className={cn(
        buttonClasses({ variant: 'outline', size: 'sm', fullWidth: true }),
        'pointer-events-none',
      )}
    >
      <ListFilter />
      {'انتخاب ویژگی\u{200C}ها'}
    </span>
  )
}

export interface ProductRailProps {
  products: CardProduct[]
  /** Names the carousel, usually the section title. */
  ariaLabel: string
  /** The shop's setting (product settings). */
  showOutOfStockLabel: boolean
}

/**
 * A horizontal rail of product cards (homepage carousels, recently viewed). The arrows sit
 * beside the track, never over the first and last cards. Server-renderable, and usable from
 * Client Components.
 */
export function ProductRail({ products, ariaLabel, showOutOfStockLabel }: ProductRailProps) {
  return (
    <Carousel ariaLabel={ariaLabel} slidesPerView={PER_VIEW} arrowGutters>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showOutOfStockLabel={showOutOfStockLabel}
          addSlot={cardAction(product)}
        />
      ))}
    </Carousel>
  )
}
